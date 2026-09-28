const { adminDb } = require("./firebaseAdmin");

/**
 * Applies one or more stock movements atomically within a Firestore
 * transaction. Every place that touches product stock — goods received,
 * loading, offloading, placing an order, cancelling one — goes through
 * this single function, so there's exactly one place that can get the
 * read-before-write ordering or the "never go negative" rule wrong.
 *
 * movements: [{ productId, field: "depot"|"car1"|"car2", delta }]
 * delta can be negative (e.g. -5 when loading 5 units onto a car reduces
 * depot stock by 5). Throws with a clear Arabic message if any resulting
 * balance would go below zero — this is what makes "block if insufficient
 * stock" actually enforceable rather than just a UI suggestion.
 *
 * Must be called with reads not yet done on these product docs elsewhere
 * in the same transaction — Firestore transactions require all reads to
 * happen before any writes, so this does all its reads up front via
 * Promise.all, then all its writes, and only ever writes AFTER every read
 * in this call has completed.
 */
async function applyStockMovements(tx, movements) {
  if (!movements.length) return;

  const refs = movements.map((m) => adminDb.collection("products").doc(m.productId));
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

  const updates = [];
  movements.forEach((m, i) => {
    const snap = snaps[i];
    if (!snap.exists) {
      const err = new Error("أحد المنتجات في هذه الحركة لم يعد موجودًا");
      err.statusCode = 400;
      throw err;
    }
    const current = snap.data().stock?.[m.field] || 0;
    const next = current + m.delta;
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
}

module.exports = { applyStockMovements };
