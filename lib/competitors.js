// Competitor prices — entered in the field by the SALES SUPERVISOR, read by
// the executive (and the manager) on /executive/competitors.
//
//   competitorPrices/{requestId}
//     { date (YYYY-MM-DD, Khartoum), deliveryRoute (where it was seen),
//       company, item, weight, weightUnit (g|kg|ml|l), itemKey, price,
//       createdAt, createdBy, createdByName, route (sales type) }
//
// The document id is the device's request ID, so an entry sent twice on a
// weak connection is stored once. `itemKey` (item name with Arabic
// spelling variants evened out + weight) groups the same product even when
// it's typed slightly differently. Entries saved before the weight field
// have `sku`/`skuKey` instead and are grouped by those.

const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { parseDecimal } = require("./qty");
const { isValidRequestId } = require("./requestId");
const { ROLES } = require("./roles");
const { normalizeAr } = require("./arabicSearch");
const { prepareAdd } = require("./places");

const WEIGHT_UNITS = ["g", "kg", "ml", "l"];
const itemKeyOf = (item, weight, unit) => `${normalizeAr(item)}|${weight}${unit}`;

const COLL = "competitorPrices";
const LIST_LIMIT = 1000;
const DEFAULT_DAYS = 365;
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
  const date = toEnglishDigits(body.date).trim();
  if (!YMD.test(date) || isNaN(new Date(`${date}T00:00:00Z`)) || date < "2000-01-01") throw bad("التاريخ غير صالح");
  if (date > businessDay(now)) throw bad("التاريخ لا يمكن أن يكون في المستقبل");
  const deliveryRoute = text(body.deliveryRoute, "المسار", 60);
  const company = text(body.company, "اسم الشركة", 60);
  const item = text(body.item, "اسم الصنف", 80);
  const weight = parseDecimal(body.weight);
  if (!Number.isFinite(weight) || weight <= 0) throw bad("وزن الصنف يجب أن يكون رقمًا أكبر من صفر");
  if (Math.round(weight * 1000) / 1000 !== weight || weight > 100000) throw bad("وزن الصنف غير صالح");
  const weightUnit = WEIGHT_UNITS.includes(body.weightUnit) ? body.weightUnit : null;
  if (!weightUnit) throw bad("اختر وحدة الوزن");
  const price = parseDecimal(body.price);
  if (!Number.isFinite(price) || price <= 0) throw bad("السعر يجب أن يكون رقمًا أكبر من صفر");
  if (Math.round(price * 100) / 100 !== price) throw bad("السعر يقبل منزلتين عشريتين فقط");
  if (price > 1e12) throw bad("السعر كبير جدًا");
  return { date, deliveryRoute, company, item, weight, weightUnit, itemKey: itemKeyOf(item, weight, weightUnit), price };
}

async function addEntry(decoded, body, now = new Date()) {
  if (!canEnter(decoded)) throw bad("إدخال أسعار المنافسين لمشرف المبيعات فقط", 403);
  const id = body?.requestId;
  if (!isValidRequestId(id)) throw bad("رقم الطلب غير صالح");
  const entry = cleanEntry(body || {}, now);
  const ref = adminDb.collection(COLL).doc(id);
  const salesRoute = decoded.role === ROLES.SALES_AGENT ? "car2" : "car1";
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // A new route typed here joins the route list for every form.
    const place = await prepareAdd(tx, decoded, { kind: "route", name: entry.deliveryRoute, salesRoute }, now);
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
    if (place.write) place.write();
    return { duplicate: false, entry: { id, ...doc }, newRoute: !place.existed };
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

/**
 * Newest first (by price date, then entry time), the last `days` days
 * (default a year, at most LIST_LIMIT entries). One indexed query.
 */
async function listEntries({ days = DEFAULT_DAYS, now = new Date() } = {}) {
  const d = Math.min(1100, Math.max(1, Math.floor(Number(days)) || DEFAULT_DAYS));
  const since = businessDay(new Date(now.getTime() - (d - 1) * 24 * 3600e3));
  const snap = await adminDb.collection(COLL).where("date", ">=", since).orderBy("date", "desc").limit(LIST_LIMIT).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { canEnter, canView, cleanEntry, addEntry, removeEntry, listEntries, skuKeyOf, itemKeyOf, WEIGHT_UNITS, LIST_LIMIT };
