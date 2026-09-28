const { admin } = require("./firebaseAdmin");
const { buildOrderFromItems } = require("./orderCreation");
const { applyStockMovements } = require("./inventory");

// The ONE implementation of "change an invoice's items" and "cancel an
// invoice", used both for direct changes and for approved change requests,
// so the two paths can never behave differently. Both run inside a caller's
// transaction, re-read the invoice there (so a double submission can never
// move stock twice), and do all reads before any writes.

function itemsKey(list) {
  return list.map((it) => `${it.productId}:${it.qty}`).sort().join("|");
}

/**
 * Re-prices the new items from the invoice's route, moves stock by the net
 * difference (release old quantities, take new ones), and writes the
 * invoice with an edit-history entry. Returns { changed, items, total }.
 * `extra` fields are merged into the invoice update (e.g. request info).
 */
async function editItemsTx(tx, orderRef, items, byUid, extra = {}) {
  const order = (await tx.get(orderRef)).data();
  if (order.status === "cancelled") {
    const err = new Error("لا يمكن تعديل فاتورة ملغاة");
    err.statusCode = 400;
    throw err;
  }

  const { resolvedItems, total } = await buildOrderFromItems(items, order.route, tx, /* skipStockCheck */ true);

  // Identical to what's saved (e.g. a repeated edit): no stock change, no
  // duplicate history entry — only the extra fields, if any.
  if (itemsKey(order.items) === itemsKey(resolvedItems)) {
    if (Object.keys(extra).length) tx.update(orderRef, extra);
    return { changed: false, items: order.items, total: order.total };
  }

  const delta = new Map();
  for (const it of order.items) delta.set(it.productId, (delta.get(it.productId) || 0) + it.qty);
  for (const it of resolvedItems) delta.set(it.productId, (delta.get(it.productId) || 0) - it.qty);
  await applyStockMovements(
    tx,
    [...delta.entries()]
      .filter(([, d]) => d !== 0)
      .map(([productId, d]) => ({ productId, field: order.route, delta: d }))
  );

  const now = new Date().toISOString();
  tx.update(orderRef, {
    items: resolvedItems,
    total,
    updatedAt: now,
    updatedBy: byUid,
    editHistory: admin.firestore.FieldValue.arrayUnion({
      items: order.items,
      total: order.total,
      editedAt: now,
      editedBy: byUid,
      ...(extra.lastRequest ? { viaRequest: extra.lastRequest.id } : {}),
    }),
    ...extra,
  });
  return { changed: true, items: resolvedItems, total };
}

/** Cancels the invoice and returns its stock to the car. Safe to repeat. */
async function cancelTx(tx, orderRef, byUid, extra = {}) {
  const order = (await tx.get(orderRef)).data();
  if (order.status === "cancelled") {
    if (Object.keys(extra).length) tx.update(orderRef, extra);
    return { changed: false };
  }
  await applyStockMovements(
    tx,
    order.items.map((it) => ({ productId: it.productId, field: order.route, delta: it.qty }))
  );
  tx.update(orderRef, {
    status: "cancelled",
    updatedAt: new Date().toISOString(),
    updatedBy: byUid,
    ...extra,
  });
  return { changed: true };
}

module.exports = { editItemsTx, cancelTx, itemsKey };
