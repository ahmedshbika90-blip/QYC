// Refunds (مرتجع): the client gives back some or all of an invoice's goods.
//
// The agent picks lines and quantities, and for each says whether the goods
// are sellable (back into his van's stock) or damaged (to damaged stock).
// The refund's value is worked out from the sale prices, with the invoice
// discount reduced in proportion — never typed in.
//   - within 9 hours: the agent does it directly; after that it's a request
//     to the manager (same flow as edits / cancellations)
//   - partial refund: the invoice keeps the remaining lines; a note on the
//     invoice records what was returned and its value
//   - full refund: the invoice is cancelled with a "refunded" note; if
//     money had been paid on it, it waits for the money to be returned
// Money: the invoice's new total simply applies. Credit only appears when
// more had been paid than the new total (paid − new total); that is given
// back through a money-return request (lib/moneyReturns.js).

const { admin, adminDb } = require("./firebaseAdmin");
const { applyStockMovements } = require("./inventory");
const { applyInvoiceDiscount, orderDiscount } = require("./invoiceDiscount");
const { writeInvoiceStats } = require("./salesStats");
const { writeClientInvoice } = require("./clientLedger");

const round2 = (n) => Math.round(Number(n) * 100) / 100;
function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/** [{ index, qty, damaged }] → { index: { qty, damaged } }, checked against the invoice lines. */
function cleanLines(raw, items) {
  if (!Array.isArray(raw) || !raw.length) throw bad("اختر الأصناف المرتجعة وكمياتها");
  const out = {};
  for (const l of raw) {
    const i = Number(l && l.index);
    const qty = Number(l && l.qty);
    if (!Number.isInteger(i) || i < 0 || i >= items.length) throw bad("صنف غير صالح في المرتجع");
    if (!Number.isInteger(qty) || qty <= 0) throw bad("الكمية المرتجعة يجب أن تكون عددًا صحيحًا أكبر من صفر");
    const prev = out[i]?.qty || 0;
    if (prev + qty > Number(items[i].qty)) throw bad(`الكمية المرتجعة من ${items[i].name} أكبر من كمية الفاتورة`);
    out[i] = { qty: prev + qty, damaged: Boolean(l.damaged) };
  }
  return out;
}

/**
 * Everything a refund would change, without writing: the new lines and
 * money, the refund's value, and the stock movements.
 */
function planRefund(order, lines) {
  const items = order.items || [];
  const ret = cleanLines(lines, items);
  const newItems = items
    .map((it, i) => {
      const qty = Number(it.qty) - (ret[i]?.qty || 0);
      return { ...it, qty, subtotal: round2((Number(it.price) || 0) * qty) };
    })
    .filter((it) => it.qty > 0);
  const oldSub = items.reduce((a, it) => a + (Number(it.subtotal) || 0), 0);
  const newSub = newItems.reduce((a, it) => a + (Number(it.subtotal) || 0), 0);
  const discount = oldSub > 0 ? round2(orderDiscount(order) * (newSub / oldSub)) : 0;
  const full = newItems.length === 0;
  const money = full ? { subtotal: 0, discount: 0, total: 0 } : applyInvoiceDiscount(newItems, discount);
  const value = round2((Number(order.total) || 0) - money.total);
  const movements = {};
  const returned = [];
  Object.entries(ret).forEach(([i, r]) => {
    const it = items[i];
    // damaged goods stay in the VAN, apart from what it can sell, until offloaded
    const field = r.damaged ? `damaged_${order.route}` : order.route;
    const key = `${it.productId}|${field}`;
    movements[key] = (movements[key] || 0) + r.qty;
    returned.push({ productId: it.productId, name: it.name, unit: it.unit || "", qty: r.qty, damaged: r.damaged, freeSample: !!it.freeSample, value: round2((Number(it.price) || 0) * r.qty) });
  });
  return {
    full,
    newItems,
    money,
    value,
    returned,
    movements: Object.entries(movements).map(([k, delta]) => {
      const [productId, field] = k.split("|");
      return { productId, field, delta };
    }),
  };
}

/**
 * Applies a refund inside the caller's transaction (direct, or an approved
 * request). Reads first, then writes. Returns { full, value, awaitingMoney }.
 */
async function refundTx(tx, orderRef, lines, byUid, extra = {}, { refundId } = {}) {
  const snap = await tx.get(orderRef);
  if (!snap.exists) throw bad("الفاتورة غير موجودة", 404);
  const order = snap.data();
  if (order.status === "cancelled") throw bad("لا يمكن إرجاع فاتورة ملغاة");
  if (refundId && (order.refunds || []).some((r) => r.id === refundId)) return { duplicate: true };
  const plan = planRefund(order, lines);
  const paySnap = await tx.get(adminDb.collection("invoicePayments").doc(orderRef.id));
  const paid = paySnap.exists ? (paySnap.data().payments || []).filter((p) => !p.voided).reduce((a, p) => a + Number(p.amount || 0), 0) : 0;
  await applyStockMovements(tx, plan.movements);

  const now = new Date().toISOString();
  const record = { id: refundId || `rf-${Date.now().toString(36)}`, at: now, by: byUid, lines: plan.returned, value: plan.value, full: plan.full, ...(extra.lastRequest ? { viaRequest: extra.lastRequest.id } : {}) };
  const awaitingMoney = plan.full && round2(paid) > 0;
  const update = {
    refunds: admin.firestore.FieldValue.arrayUnion(record),
    refundedTotal: admin.firestore.FieldValue.increment(plan.value),
    updatedAt: now,
    updatedBy: byUid,
    ...extra,
  };
  let after;
  if (plan.full) {
    // Fully refunded: cancelled, with a "refunded" note. If money was paid,
    // it shows as waiting for the money to be returned until that's approved.
    Object.assign(update, { status: "cancelled", refundStatus: awaitingMoney ? "awaitingMoney" : "full" });
    after = { ...order, status: "cancelled" };
  } else {
    Object.assign(update, { items: plan.newItems, subtotal: plan.money.subtotal, discount: plan.money.discount, total: plan.money.total, refundStatus: "partial" });
    after = { ...order, items: plan.newItems, subtotal: plan.money.subtotal, discount: plan.money.discount, total: plan.money.total };
  }
  tx.update(orderRef, update);
  writeInvoiceStats(tx, order, after);
  writeClientInvoice(tx, orderRef.id, order, after);
  return { full: plan.full, value: plan.value, awaitingMoney, credit: Math.max(0, round2(paid - (plan.full ? 0 : plan.money.total))) };
}

module.exports = { refundTx, planRefund, cleanLines };
