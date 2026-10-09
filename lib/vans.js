// Vans (sales routes) as data instead of the fixed car1 / car2.
//
//   vans/{id}   { label, type: "wholesale" | "retail", active, createdAt }
//
// The van id is what invoices, clients, stock fields (product.stock[id]),
// invoice logs and daily summaries already use as `route` — so the two
// existing vans keep their ids "car1" (wholesale) and "car2" (retail) and
// nothing has to be migrated. They exist even before anyone saves them
// (DEFAULT_VANS); saving one stores it.
//
// Prices stay per sales TYPE (product.prices.car1 = wholesale price,
// product.prices.car2 = retail price), so a new van uses its type's price.
// A sales account carries its van in the `van` claim (lib/roles.js) and, for
// agents, the supervisor they report to in `supervisorUid`.

const { adminDb } = require("./firebaseAdmin");
const { cachedByVersions } = require("./serverCache");

const COLL = "vans";
const TYPES = ["wholesale", "retail"];
const TYPE_LABELS = { wholesale: "جملة", retail: "تجزئة" };
const PRICE_KEY = { wholesale: "car1", retail: "car2" }; // product.prices field per type
const DEFAULT_VANS = [
  { id: "car1", label: "عربة الجملة", type: "wholesale", active: true },
  { id: "car2", label: "عربة التجزئة", type: "retail", active: true },
];
const VAN_ID = /^[a-z0-9][a-z0-9-]{1,30}$/;

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/** All vans (saved ones + the two original ones), cached until a van changes. */
async function listVans() {
  return cachedByVersions("vans", ["vans"], 5 * 60 * 1000, async () => {
    const snap = await adminDb.collection(COLL).get();
    const saved = Object.fromEntries(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    const all = DEFAULT_VANS.map((v) => ({ ...v, ...(saved[v.id] || {}) }));
    for (const [id, v] of Object.entries(saved)) if (!all.some((x) => x.id === id)) all.push(v);
    return all.sort((a, b) => (a.type === b.type ? String(a.label).localeCompare(String(b.label), "ar") : a.type === "wholesale" ? -1 : 1));
  });
}

async function getVan(id) {
  return (await listVans()).find((v) => v.id === id) || null;
}

/** Sales type of a van ("wholesale" | "retail"); the originals by their id. */
async function vanType(id) {
  const v = await getVan(id);
  if (v) return v.type;
  return id === "car2" ? "retail" : "wholesale";
}

/** Which product price applies on this van: prices.car1 (wholesale) or prices.car2 (retail). */
async function priceKeyFor(id) {
  return PRICE_KEY[await vanType(id)];
}

/** { vanId: "w" | "r" } — the old two-channel view, for dashboards. */
async function channelMap() {
  return Object.fromEntries((await listVans()).map((v) => [v.id, v.type === "retail" ? "r" : "w"]));
}

/** Admin: add or edit a van. */
async function saveVan(body = {}) {
  const label = typeof body.label === "string" ? body.label.replace(/\s+/g, " ").trim() : "";
  if (!label) throw bad("اكتب اسم العربة");
  if (label.length > 40) throw bad("اسم العربة طويل جدًا");
  if (!TYPES.includes(body.type)) throw bad("اختر نوع البيع: جملة أو تجزئة");
  const existing = body.id ? await getVan(String(body.id)) : null;
  if (existing && existing.type !== body.type) throw bad("لا يمكن تغيير نوع عربة بعد إنشائها — أنشئ عربة جديدة");
  let id = existing ? existing.id : String(body.newId || "").trim().toLowerCase();
  if (!existing) {
    if (!id) id = `van-${Date.now().toString(36)}`;
    if (!VAN_ID.test(id)) throw bad("رمز العربة: حروف إنجليزية صغيرة وأرقام وشرطة فقط");
    if (await getVan(id)) throw bad("يوجد عربة بهذا الرمز");
  }
  const doc = { label, type: body.type, active: body.active !== false, updatedAt: new Date().toISOString() };
  if (!existing) doc.createdAt = doc.updatedAt;
  await adminDb.collection(COLL).doc(id).set(doc, { merge: true });
  return { id, ...doc };
}

module.exports = { listVans, getVan, vanType, priceKeyFor, channelMap, saveVan, DEFAULT_VANS, TYPES, TYPE_LABELS, PRICE_KEY, VAN_COLL: COLL };
