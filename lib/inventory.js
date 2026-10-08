const { adminDb } = require("./firebaseAdmin");
const { roundQty } = require("./qty");

/**
 * Applies one or more stock movements atomically within a Firestore
 * transaction. Every place that touches product stock — goods received,
 * loading, offloading, placing an order, cancelling one — goes through
 * this single function, so there's exactly one place that can get the
 * read-before-write ordering or the "never go negative" rule wrong.
 *
 * movements: [{ productId, field: "depot"|"car1"|"car2"|"damaged", delta }]
 * delta can be negative (e.g. -5 when loading 5 units onto a car reduces
 * depot stock by 5). Throws with a clear Arabic message if any resulting
 * balance would go below zero — this is what makes "block if insufficient
 * stock" actually enforceable rather than just a UI suggestion.
 *
 * Movements are grouped by (productId, field) and their deltas SUMMED
 * before anything is read — this matters whenever the same product+field
 * appears more than once in one call (e.g. an order with the same product
 * split across a free-sample line and a paid line, both reducing the same
 * car's stock): each duplicate reads the same pre-write balance, so
 * applying them independently would silently keep only the last one's
 * effect instead of both. Grouping first makes that impossible.
 *
 * Must be called with reads not yet done on these product docs elsewhere
 * in the same transaction — Firestore transactions require all reads to
 * happen before any writes, so this does all its reads up front via
 * Promise.all, then all its writes, and only ever writes AFTER every read
 * in this call has completed.
 */
async function applyStockMovements(tx, movements) {
  if (!movements.length) return;

  const grouped = new Map(); // "productId:field" -> { productId, field, delta }
  for (const m of movements) {
    const key = `${m.productId}:${m.field}`;
    const g = grouped.get(key);
    if (g) g.delta += m.delta;
    else grouped.set(key, { productId: m.productId, field: m.field, delta: m.delta });
  }
  const entries = [...grouped.values()];

  const refs = entries.map((m) => adminDb.collection("products").doc(m.productId));
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

  const updates = [];
  entries.forEach((m, i) => {
    const snap = snaps[i];
    if (!snap.exists) {
      const err = new Error("أحد المنتجات في هذه الحركة لم يعد موجودًا");
      err.statusCode = 400;
      throw err;
    }
    const current = snap.data().stock?.[m.field] || 0;
    // Fractional quantities: round the result so float noise never
    // accumulates in a stored balance (2.3 - 0.1 must be 2.2, not 2.1999…).
    const next = roundQty(current + m.delta);
    if (next < 0) {
      const err = new Error(`رصيد "${snap.data().name}" غير كافٍ لإتمام هذه الحركة`);
      err.statusCode = 400;
      throw err;
    }
    updates.push({ ref: refs[i], field: m.field, next });
  });

  updates.forEach(({ ref, field, next }) => {
    tx.update(ref, { [`stock.${field}`]: next });
  });
  // Stock ledger: every change, in the same transaction, so the nightly
  // stock check (lib/stockCheck.js) can prove each balance.
  writeLedger(tx, entries.filter((m) => m.delta), "movement");
}

/** One ledger record for a set of stock changes (lib/stockCheck.js). */
function writeLedger(tx, entries, kind, extra = {}) {
  if (!entries.length) return;
  tx.set(adminDb.collection("stockLedger").doc(), {
    at: new Date().toISOString(),
    kind,
    entries: entries.map(({ productId, field, delta }) => ({ productId, field, delta })),
    ...extra,
  });
}

module.exports = { applyStockMovements, writeLedger };
