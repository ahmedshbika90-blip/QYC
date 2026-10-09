// Nightly stock check: proves every product's balance (depot, each van,
// damaged) equals its starting point plus every recorded movement since —
// receipts, loadings, returns, damage, transfers, sales, cancellations,
// invoice edits and the manager's depot corrections all write to the stock
// ledger in the same transaction as the balance (lib/inventory.js).
// Differences are REPORTED to the manager, never corrected automatically.
//
//   stockLedger/{id}        { at, kind, entries: [{ productId, field, delta }] }
//   meta/stockCheckpoint    { at, stock: { [productId]: { depot, car1, … } } }
//                           — the balances everything is checked against;
//                           moved forward by each check
//   meta/stockCheck         the latest result { at, ok, diffs, … }
//   stockChecks/{day}       one result per day (history)
//
// The first run takes today's balances as the starting point. When the
// manager has counted a product and agrees with its balance, "accept"
// makes the current balance the new starting point for that product.

const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");

const CP = () => adminDb.collection("meta").doc("stockCheckpoint");
const LAST = () => adminDb.collection("meta").doc("stockCheck");
const EPS = 1e-6;
const round = (n) => Math.round(n * 1000) / 1000;

function addLedger(target, docs) {
  for (const d of docs) for (const e of d.data().entries || []) {
    const p = (target[e.productId] = target[e.productId] || {});
    p[e.field] = round((p[e.field] || 0) + (Number(e.delta) || 0));
  }
  return target;
}

function compare(expected, products) {
  const diffs = [];
  const ids = new Set([...Object.keys(expected), ...products.map((p) => p.id)]);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  for (const id of ids) {
    const actual = byId[id]?.stock || {};
    const exp = expected[id] || {};
    for (const field of new Set([...Object.keys(actual), ...Object.keys(exp)])) {
      const a = Number(actual[field]) || 0;
      const e = Number(exp[field]) || 0;
      if (Math.abs(a - e) > EPS) diffs.push({ productId: id, name: byId[id]?.name || id, field, expected: e, actual: a, difference: round(a - e) });
    }
  }
  return diffs.sort((x, y) => x.name.localeCompare(y.name, "ar") || x.field.localeCompare(y.field));
}

/** Runs the check (writes the result and moves the checkpoint forward). */
async function runStockCheck(now = new Date()) {
  const at = now.toISOString();
  return adminDb.runTransaction(async (tx) => {
    const cp = await tx.get(CP());
    const productsSnap = await tx.get(adminDb.collection("products"));
    const products = productsSnap.docs.map((d) => ({ id: d.id, name: d.data().name, stock: d.data().stock || {} }));
    if (!cp.exists) {
      const stock = Object.fromEntries(products.map((p) => [p.id, { ...p.stock }]));
      tx.set(CP(), { at, stock });
      const result = { at, ok: true, baseline: true, diffs: [], products: products.length, movements: 0 };
      tx.set(LAST(), result);
      return result;
    }
    const base = cp.data();
    // ">=" plus the ids already counted at the boundary: a movement saved in
    // the same millisecond as the last check is counted exactly once.
    const skip = new Set(base.boundary || []);
    const ledgerSnap = await tx.get(adminDb.collection("stockLedger").where("at", ">=", base.at).where("at", "<=", at));
    const docs = ledgerSnap.docs.filter((d) => !skip.has(d.id));
    const ledger = { docs, size: docs.length };
    const expected = addLedger(JSON.parse(JSON.stringify(base.stock || {})), ledger.docs);
    const diffs = compare(expected, products);
    const result = { at, ok: diffs.length === 0, diffs: diffs.slice(0, 200), products: products.length, movements: ledger.size };
    // Move forward on what the ledger says, NOT on the actual balances —
    // a difference keeps showing until the manager looks at it.
    tx.set(CP(), { at, stock: expected, boundary: docs.filter((d) => d.data().at === at).map((d) => d.id) });
    tx.set(LAST(), result);
    tx.set(adminDb.collection("stockChecks").doc(businessDay(now)), result);
    return result;
  });
}

/** Manager: "this balance is right" — makes the current balance the starting point. */
async function acceptBalance(productId, field, byUid, now = new Date()) {
  return adminDb.runTransaction(async (tx) => {
    const cp = await tx.get(CP());
    if (!cp.exists) return { ok: true };
    const base = cp.data();
    const [product, ledger, last] = await Promise.all([
      tx.get(adminDb.collection("products").doc(productId)),
      tx.get(adminDb.collection("stockLedger").where("at", ">=", base.at)),
      tx.get(LAST()),
    ]);
    // Movements after the checkpoint are added on top of it later, so the
    // starting point is the current balance minus those movements.
    const skip = new Set(base.boundary || []);
    const since = addLedger({}, ledger.docs.filter((d) => !skip.has(d.id)))[productId] || {};
    const stock = { ...(base.stock || {}) };
    const actual = product.exists ? product.data().stock || {} : {};
    const fields = field ? [field] : Object.keys({ ...actual, ...(stock[productId] || {}) });
    stock[productId] = { ...(stock[productId] || {}) };
    fields.forEach((f) => (stock[productId][f] = round((Number(actual[f]) || 0) - (since[f] || 0))));
    tx.set(CP(), { ...base, stock });
    if (last.exists) {
      const diffs = (last.data().diffs || []).filter((d) => !(d.productId === productId && (!field || d.field === field)));
      tx.set(LAST(), { ...last.data(), diffs, ok: diffs.length === 0, acceptedAt: now.toISOString(), acceptedBy: byUid });
    }
    return { ok: true };
  });
}

async function lastCheck() {
  const s = await LAST().get();
  return s.exists ? s.data() : null;
}

module.exports = { runStockCheck, acceptBalance, lastCheck, compare, addLedger };
