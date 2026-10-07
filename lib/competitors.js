// Competitor prices — entered in the field by the SALES SUPERVISOR, read by
// the executive (and the manager) on /executive/competitors.
//
//   competitorPrices/{requestId}
//     { company, item, sku, skuKey, price, date (YYYY-MM-DD, Khartoum),
//       createdAt, createdBy, createdByName, route }
//
// The document id is the device's request ID, so an entry sent twice on a
// weak connection is stored once. `skuKey` (SKU upper-cased, spaces
// removed) groups the same product even when it's typed slightly
// differently.

const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { parseDecimal } = require("./qty");
const { isValidRequestId } = require("./requestId");
const { ROLES } = require("./roles");

const COLL = "competitorPrices";
const LIST_LIMIT = 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

const toEnglishDigits = (v) =>
  String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

function text(v, label, max) {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!s) throw bad(`${label} مطلوب`);
  if (s.length > max) throw bad(`${label} أطول من ${max} حرفًا`);
  return s;
}

const skuKeyOf = (sku) => toEnglishDigits(sku).toUpperCase().replace(/\s+/g, "");

/** Sales supervisors only (either route) — not agents, not the manager. */
function canEnter(decoded) {
  return (decoded.role === ROLES.SALES_SUPERVISOR || decoded.role === ROLES.SALES_AGENT) && decoded.salesSupervisor === true;
}
const VIEW_ROLES = [ROLES.EXECUTIVE, ROLES.MANAGER];
function canView(decoded) {
  return VIEW_ROLES.includes(decoded.role) || canEnter(decoded);
}

function cleanEntry(body, now = new Date()) {
  const company = text(body.company, "اسم الشركة", 60);
  const item = text(body.item, "اسم الصنف", 80);
  const sku = toEnglishDigits(text(body.sku, "رمز الصنف (SKU)", 40));
  const price = parseDecimal(body.price);
  if (!Number.isFinite(price) || price <= 0) throw bad("السعر يجب أن يكون رقمًا أكبر من صفر");
  if (Math.round(price * 100) / 100 !== price) throw bad("السعر يقبل منزلتين عشريتين فقط");
  if (price > 1e12) throw bad("السعر كبير جدًا");
  const date = toEnglishDigits(body.date).trim();
  if (!YMD.test(date) || isNaN(new Date(`${date}T00:00:00Z`)) || date < "2000-01-01") throw bad("التاريخ غير صالح");
  if (date > businessDay(now)) throw bad("التاريخ لا يمكن أن يكون في المستقبل");
  return { company, item, sku, skuKey: skuKeyOf(sku), price, date };
}

async function addEntry(decoded, body, now = new Date()) {
  if (!canEnter(decoded)) throw bad("إدخال أسعار المنافسين لمشرف المبيعات فقط", 403);
  const id = body?.requestId;
  if (!isValidRequestId(id)) throw bad("رقم الطلب غير صالح");
  const entry = cleanEntry(body || {}, now);
  const ref = adminDb.collection(COLL).doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data();
      if (d.createdBy !== decoded.uid) throw bad("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى", 409);
      return { duplicate: true, entry: { id, ...d } };
    }
    const doc = {
      ...entry,
      createdAt: now.toISOString(),
      createdBy: decoded.uid,
      createdByName: decoded.name || decoded.email || null,
      route: decoded.route || null,
    };
    tx.create(ref, doc);
    return { duplicate: false, entry: { id, ...doc } };
  });
}

/** The person who entered it may remove a mistaken entry; so may the manager. */
async function removeEntry(decoded, id) {
  if (typeof id !== "string" || !id || id.length > 200) throw bad("الإدخال غير صالح");
  const ref = adminDb.collection(COLL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw bad("الإدخال غير موجود", 404);
  const mine = canEnter(decoded) && snap.data().createdBy === decoded.uid;
  if (!mine && decoded.role !== ROLES.MANAGER) throw bad("يمكنك حذف إدخالاتك فقط", 403);
  await ref.delete();
}

/** Newest first (by price date, then entry time). One indexed query. */
async function listEntries() {
  const snap = await adminDb.collection(COLL).orderBy("date", "desc").limit(LIST_LIMIT).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { canEnter, canView, cleanEntry, addEntry, removeEntry, listEntries, skuKeyOf, LIST_LIMIT };
