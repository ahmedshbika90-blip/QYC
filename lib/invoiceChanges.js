const { admin } = require("./firebaseAdmin");
const { buildOrderFromItems } = require("./orderCreation");
const { applyStockMovements } = require("./inventory");
const { applyInvoiceDiscount, orderDiscount } = require("./invoiceDiscount");

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
 *
 * `discount` (optional): the invoice-level discount amount. Left undefined,
 * the invoice keeps the discount it already has; it's re-checked against
 * the new lines either way, so an edit can't leave a discount larger than
 * the invoice.
 */
async function editItemsTx(tx, orderRef, items, byUid, extra = {}, { discount } = {}) {
  const order = (await tx.get(orderRef)).data();
  if (order.status === "cancelled") {
    const err = new Error("لا يمكن تعديل فاتورة ملغاة");
    err.statusCode = 400;
    throw err;
  }

  const { resolvedItems: freshItems } = await buildOrderFromItems(items, order.route, tx, /* skipStockCheck */ true);
  // A product that was already on the invoice keeps the unit cost it was
  // sold at, so editing an invoice after a cost change doesn't rewrite
  // the margin of that sale. Newly added products take today's cost.
  const soldCost = new Map();
  for (const it of order.items || []) {
    if (it.unitCost != null && !soldCost.has(it.productId)) soldCost.set(it.productId, it.unitCost);
  }
  const resolvedItems = freshItems.map((it) =>
    soldCost.has(it.productId) ? { ...it, unitCost: soldCost.get(it.productId) } : it
  );
  const money = applyInvoiceDiscount(resolvedItems, discount === undefined ? orderDiscount(order) : discount);
  const total = money.total;

  // Identical to what's saved (e.g. a repeated edit): no stock change, no
  // duplicate history entry — only the extra fields, if any.
  if (itemsKey(order.items) === itemsKey(resolvedItems) && money.discount === orderDiscount(order)) {
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
    subtotal: money.subtotal,
    discount: money.discount,
    total,
    updatedAt: now,
    updatedBy: byUid,
    editHistory: admin.firestore.FieldValue.arrayUnion({
      items: order.items,
      discount: orderDiscount(order),
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
