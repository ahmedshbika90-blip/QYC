const { adminAuth } = require("./firebaseAdmin");
const { normalizeRole, salesFlags } = require("./roles");
const { checkAppCheck } = require("./appCheckServer");
const { MFA_ROLES, usedSecondFactor } = require("./mfa");

// How long a server instance trusts its last look at an account (disabled?
// signed out by the admin?). Short enough that a demoted or disabled user
// loses access within a minute; long enough that a busy page doesn't cost
// one Auth lookup per API call.
const ACCOUNT_CHECK_TTL_MS = 60 * 1000;
const accountCache = new Map(); // uid -> { at, disabled, validAfterSec }

function authError(message, statusCode = 401, revoked = false) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (revoked) err.sessionRevoked = true;
  return err;
}

async function accountState(uid) {
  const hit = accountCache.get(uid);
  if (hit && Date.now() - hit.at < ACCOUNT_CHECK_TTL_MS) return hit;
  const rec = await adminAuth.getUser(uid);
  const state = {
    at: Date.now(),
    disabled: rec.disabled,
    validAfterSec: rec.tokensValidAfterTime ? Math.floor(Date.parse(rec.tokensValidAfterTime) / 1000) : 0,
  };
  accountCache.set(uid, state);
  return state;
}

// Called by the admin API right after changing an account, so THIS server
// instance stops trusting the old session immediately (others within the TTL).
function forgetAccount(uid) {
  accountCache.delete(uid);
}

/**
 * Verifies the Firebase ID token sent in the Authorization header
 * ("Bearer <token>") and returns the decoded token, with `role`
 * normalized (legacy "manager" → "manager", see lib/roles.js).
 *
 * Also refuses tokens of accounts the admin has disabled or signed out
 * (role changed, password reset): ID tokens stay cryptographically valid
 * for up to an hour, so without this a demoted user would keep their old
 * role until it expired.
 */
async function requireUser(req) {
  await checkAppCheck(req); // off unless APP_CHECK=monitor|enforce
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw authError("Missing Authorization header");

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (e) {
    throw authError("Invalid or expired token");
  }

  // Real Firebase tokens always carry auth_time (seconds).
  if (decoded.auth_time && decoded.uid) {
    let state;
    try {
      state = await accountState(decoded.uid);
    } catch (e) {
      if (e.code === "auth/user-not-found") throw authError("الحساب غير موجود", 401, true);
      throw e;
    }
    if (state.disabled) throw authError("تم إيقاف هذا الحساب", 401, true);
    if (decoded.auth_time < state.validAfterSec) throw authError("انتهت الجلسة — سجّل الدخول من جديد", 401, true);
  }

  // Sales staff: which route they sell on and whether they're a sales
  // supervisor (lib/roles.js). Computed BEFORE role normalisation reads
  // the raw claims; both are set by the admin.
  const flags = salesFlags(decoded);
  decoded.route = flags.route;
  decoded.salesSupervisor = flags.salesSupervisor;
  decoded.supervisorUid = flags.supervisorUid;
  decoded.role = normalizeRole(decoded.role);

  // Two-step login required for admin / manager / accountant (lib/mfa.js).
  if (process.env.REQUIRE_2FA === "1" && MFA_ROLES.includes(decoded.role) && !usedSecondFactor(decoded)) {
    const err = authError("التحقق بخطوتين مطلوب لهذا الحساب — فعّله ثم سجّل الدخول من جديد", 403);
    err.mfaRequired = true;
    throw err;
  }
  return decoded;
}

function requireRole(decoded, allowedRoles) {
  if (!allowedRoles.includes(decoded.role)) {
    const err = new Error("Forbidden: insufficient role");
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Standard error response for API routes. Marks revoked sessions with a
 * header the browser watches (lib/apiFetch.js) to sign the user out at once.
 */
function sendError(res, err) {
  if (err.sessionRevoked && typeof res.setHeader === "function") res.setHeader("X-Session-Revoked", "1");
  const status = err.statusCode || 500;
  if (status === 500) {
    // A short code the user can read out; the same code is in the Vercel
    // log line (Vercel → Logs, search for it) with the real error.
    const code = Date.now().toString(36).slice(-5).toUpperCase();
    console.error(`[server-error ${code}] ${(res.req && res.req.url) || ""}`, err);
    return res.status(500).json({ error: `حدث خطأ في الخادم (رمز ${code})`, code });
  }
  return res.status(status).json({ error: err.message });
}

module.exports = { requireUser, requireRole, sendError, forgetAccount };
