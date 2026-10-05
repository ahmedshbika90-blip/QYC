const { admin, adminAuth, adminDb } = require("./firebaseAdmin");
const { ASSIGNABLE_ROLES, normalizeRole } = require("./roles");
const { forgetAccount } = require("./apiAuth");

// Account management for the admin role (/admin/users). Everything here
// runs with the Admin SDK on the server; the browser only ever sends the
// requested change, which is validated below before it reaches Firebase.

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanName(v) {
  if (v == null) return "";
  if (typeof v !== "string") throw bad("الاسم غير صالح");
  const name = v.trim().replace(/\s+/g, " ");
  if (name.length > 60) throw bad("الاسم أطول من 60 حرفًا");
  return name;
}

function cleanRole(v) {
  if (v === null || v === "" || v === undefined) return null;
  if (!ASSIGNABLE_ROLES.includes(v)) throw bad("الصلاحية غير معروفة");
  return v;
}

function cleanPassword(v) {
  if (typeof v !== "string" || v.length < 8) throw bad("كلمة المرور يجب ألا تقل عن 8 أحرف");
  if (v.length > 128) throw bad("كلمة المرور طويلة جدًا");
  return v;
}

function present(u) {
  const raw = u.customClaims?.role || null;
  return {
    uid: u.uid,
    email: u.email || "",
    displayName: u.displayName || "",
    role: normalizeRole(raw),
    // Still on the pre-rename key ("supervisor"); saving the account fixes it.
    legacyRole: raw && normalizeRole(raw) !== raw ? raw : null,
    disabled: Boolean(u.disabled),
    createdAt: u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
    lastSignIn: u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
  };
}

async function listAccounts() {
  const out = [];
  let pageToken;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    page.users.forEach((u) => out.push(present(u)));
    pageToken = page.pageToken;
  } while (pageToken);
  return out.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, "ar"));
}

async function audit(actor, action, targetUid, details) {
  await adminDb.collection("auditLog").add({
    area: "accounts",
    action,
    targetUid,
    details,
    by: actor.uid,
    byEmail: actor.email || null,
    at: new Date().toISOString(),
  });
}

async function createAccount(actor, body) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw bad("البريد الإلكتروني غير صالح");
  const password = cleanPassword(body.password);
  const displayName = cleanName(body.displayName);
  const role = cleanRole(body.role);

  let user;
  try {
    user = await adminAuth.createUser({ email, password, displayName: displayName || undefined });
  } catch (e) {
    if (e.code === "auth/email-already-exists") throw bad("يوجد حساب بهذا البريد الإلكتروني بالفعل", 409);
    if (e.code === "auth/invalid-password") throw bad("كلمة المرور يجب ألا تقل عن 8 أحرف");
    throw e;
  }
  if (role) await adminAuth.setCustomUserClaims(user.uid, { role });
  await audit(actor, "create", user.uid, { email, role });
  return present(await adminAuth.getUser(user.uid));
}

/**
 * body may contain any of: role (string | null), displayName, disabled
 * (boolean), password. Changing the role, disabling, or setting a new
 * password also ends every open session of that account (its next request
 * is refused — lib/apiAuth.js), so the change applies right away.
 */
async function updateAccount(actor, uid, body) {
  if (typeof uid !== "string" || !uid || uid.length > 128) throw bad("الحساب غير صالح");
  const isSelf = uid === actor.uid;

  let user;
  try {
    user = await adminAuth.getUser(uid);
  } catch (e) {
    if (e.code === "auth/user-not-found") throw bad("الحساب غير موجود", 404);
    throw e;
  }

  const profile = {};
  const changes = {};
  let endSessions = false;

  if (body.displayName !== undefined) {
    profile.displayName = cleanName(body.displayName) || null;
    changes.displayName = profile.displayName;
  }
  if (body.password !== undefined) {
    profile.password = cleanPassword(body.password);
    changes.password = "changed";
    endSessions = !isSelf; // the admin's own session survives their own reset
  }
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== "boolean") throw bad("قيمة الإيقاف غير صالحة");
    if (isSelf && body.disabled) throw bad("لا يمكنك إيقاف حسابك أنت");
    profile.disabled = body.disabled;
    changes.disabled = body.disabled;
    if (body.disabled) endSessions = true;
  }

  let claims = null;
  if (body.role !== undefined) {
    const role = cleanRole(body.role);
    const current = normalizeRole(user.customClaims?.role);
    if (isSelf && role !== current) throw bad("لا يمكنك تغيير صلاحية حسابك أنت — اطلب ذلك من مدير نظام آخر");
    const { role: _old, ...rest } = user.customClaims || {};
    claims = role ? { ...rest, role } : rest;
    // Rewriting a legacy "supervisor" claim as "manager" is not a real
    // change for the person, so it doesn't end their session.
    if (role !== current) {
      changes.role = { from: current, to: role };
      endSessions = true;
    }
  }

  if (Object.keys(profile).length) await adminAuth.updateUser(uid, profile);
  if (claims) await adminAuth.setCustomUserClaims(uid, claims);
  if (endSessions) {
    await adminAuth.revokeRefreshTokens(uid);
    forgetAccount(uid);
  }
  if (Object.keys(changes).length) await audit(actor, "update", uid, changes);
  return present(await adminAuth.getUser(uid));
}

async function recentAudit(limit = 30) {
  const snap = await adminDb.collection("auditLog").where("area", "==", "accounts").orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { listAccounts, createAccount, updateAccount, recentAudit, present };
