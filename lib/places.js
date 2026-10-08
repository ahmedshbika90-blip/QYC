// Delivery routes (المسار) and locations (الموقع) that staff add on their
// own — from the clients screen, or a new route typed into a competitor
// price — so they appear in the pickers before any client uses them.
// The pickers show these PLUS the routes/locations already on clients.
//
//   places/{salesRoute}__{kind}__{name}
//     { kind: "route" | "location", name, salesRoute: "car1" | "car2",
//       deliveryRoute (locations: the route it belongs to, optional),
//       createdBy, createdAt }
//
// The document id is the name itself (per sales type and kind), so adding
// the same route twice — two phones, or a retry — stores it once.

const { adminDb } = require("./firebaseAdmin");
const { ROLES } = require("./roles");

const COLL = "places";
const MAX = 60;
const KINDS = ["route", "location"];
const SALES = ["car1", "car2"];

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

const cleanName = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const placeId = (salesRoute, kind, name) => `${salesRoute}__${kind}__${name.replace(/\//g, "∕")}`;

/** Sales staff add to their own sales type; the manager chooses one. */
function salesRouteFor(decoded, asked) {
  if (decoded.role === ROLES.SALES_SUPERVISOR) return "car1";
  if (decoded.role === ROLES.SALES_AGENT) return "car2";
  if (decoded.role === ROLES.MANAGER) {
    if (!SALES.includes(asked)) throw bad("اختر نوع البيع");
    return asked;
  }
  throw bad("Forbidden: insufficient role", 403);
}

/** Inside a transaction (reads first): returns a write to run after, or null if it exists. */
async function prepareAdd(tx, decoded, { kind, name, salesRoute, deliveryRoute }, now = new Date()) {
  const clean = cleanName(name);
  if (!KINDS.includes(kind)) throw bad("نوع غير صالح");
  if (!clean) throw bad(kind === "route" ? "اكتب اسم المسار" : "اكتب اسم الموقع");
  if (clean.length > MAX) throw bad(`الاسم أطول من ${MAX} حرفًا`);
  const ref = adminDb.collection(COLL).doc(placeId(salesRoute, kind, clean));
  const snap = await tx.get(ref);
  if (snap.exists) return { ref, existed: true, doc: snap.data(), write: null };
  const doc = { kind, name: clean, salesRoute, createdBy: decoded.uid, createdAt: now.toISOString() };
  const route = cleanName(deliveryRoute);
  if (kind === "location" && route) doc.deliveryRoute = route.slice(0, MAX);
  return { ref, existed: false, doc, write: () => tx.create(ref, doc) };
}

/** Adds a route and/or a location (the location under that route). */
async function addPlaces(decoded, body = {}) {
  const salesRoute = salesRouteFor(decoded, body.salesRoute);
  const route = cleanName(body.route);
  const location = cleanName(body.location);
  if (!route && !location) throw bad("اكتب اسم المسار أو الموقع");
  return adminDb.runTransaction(async (tx) => {
    const preps = [];
    if (route) preps.push(await prepareAdd(tx, decoded, { kind: "route", name: route, salesRoute }));
    if (location) preps.push(await prepareAdd(tx, decoded, { kind: "location", name: location, salesRoute, deliveryRoute: route }));
    preps.forEach((p) => p.write && p.write());
    return { salesRoute, added: preps.filter((p) => !p.existed).map((p) => p.doc), existing: preps.filter((p) => p.existed).map((p) => p.doc) };
  });
}

/** Everything for one sales type (agents) or both (manager): one query. */
async function listPlaces(decoded) {
  let q = adminDb.collection(COLL);
  if (decoded.role === ROLES.SALES_SUPERVISOR) q = q.where("salesRoute", "==", "car1");
  else if (decoded.role === ROLES.SALES_AGENT) q = q.where("salesRoute", "==", "car2");
  else if (decoded.role !== ROLES.MANAGER) throw bad("Forbidden: insufficient role", 403);
  const snap = await q.get();
  const all = snap.docs.map((d) => d.data());
  return {
    routes: all.filter((p) => p.kind === "route").map(({ name, salesRoute }) => ({ name, salesRoute })),
    locations: all.filter((p) => p.kind === "location").map(({ name, salesRoute, deliveryRoute }) => ({ name, salesRoute, deliveryRoute: deliveryRoute || null })),
  };
}

module.exports = { addPlaces, listPlaces, prepareAdd, salesRouteFor, cleanName, placeId, PLACES_MAX: MAX };
