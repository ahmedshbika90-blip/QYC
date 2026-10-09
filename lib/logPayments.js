// Payments against an INVOICE LOG (one van, one day — lib/invoiceLogs.js).
//
// The accountant records what the agent handed over for that day —
// transfer reference, bank, amount, date, note — TOGETHER with how much of
// it each invoice in the log received, typed in by hand. A payment is saved
// only when those amounts add up to it exactly (nothing is left over or
// filled in automatically), in one transaction. The reference lives on the
// log payment; an invoice only records the AMOUNT it received (and from
// which log), so invoice badges and reports keep working.
// Reference rules: a bank + reference can be used once; the same last 4
// digits as an earlier payment asks for approval first. The split can be
// changed later — again only to one that adds up to the payment exactly.
// 3. A wrong payment is voided (with a reason) — its shares are voided with
//    it. Nothing is ever deleted.
//
//   logPayments/{requestId}
//     { logId, route, day, ref, bank, amount, date, note, status,
//       allocations: { [orderId]: amount }, allocatedTotal,
//       createdAt, createdBy, voidedAt?, voidReason? }

const { adminDb } = require("./firebaseAdmin");
const { isValidRequestId } = require("./requestId");
const P = require("./payments");
const { parseLogId, writeLogDelta, logView, cents, COLL: LOG_COLL } = require("./invoiceLogs");

const { UTC_OFFSET, CURRENCY } = require("./companyConfig");
const COLL = "logPayments";
const DAYMS = 24 * 3600e3;
const MAX_INVOICES_PER_LOG = 150;

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
const round2 = P.round2;

function dayWindow(day) {
  const start = new Date(`${day}T00:00:00${UTC_OFFSET}`);
  return [start.toISOString(), new Date(start.getTime() + DAYMS - 1).toISOString()];
}

/** The invoices in a log (one van, one day): one query. */
async function logOrders(route, day, tx) {
  const [from, to] = dayWindow(day);
  // Date range only (automatic single-field index) and the van picked out
  // here: a day's invoices are few, and no composite index is needed.
  const q = adminDb.collection("orders").where("createdAt", ">=", from).where("createdAt", "<=", to);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => o.route === route);
}


const sumOf = (m) => round2(Object.values(m).reduce((a, b) => a + b, 0));

/** { orderId: amount } from the form; empty / zero = nothing for that invoice. */
function cleanAllocations(raw) {
  if (!raw || typeof raw !== "object") throw bad("سجّل المبلغ الذي دفعه كل عميل");
  const wanted = {};
  for (const [orderId, v] of Object.entries(raw)) {
    if (typeof orderId !== "string" || !orderId || orderId.length > 200) throw bad("فاتورة غير صالحة في التوزيع");
    const text = String(v ?? "").trim();
    if (!text || /^[0٠.,]+$/.test(text)) continue;
    wanted[orderId] = P.cleanAmount(text);
  }
  if (Object.keys(wanted).length > MAX_INVOICES_PER_LOG) throw bad("عدد الفواتير في التوزيع كبير جدًا");
  return wanted;
}

/** The amounts must use the whole payment — the payment isn't complete until they do. */
function requireComplete(wanted, amount) {
  const total = sumOf(wanted);
  if (total !== round2(amount)) {
    const left = round2(amount - total);
    throw bad(left > 0 ? `وزّع كامل المبلغ على الفواتير قبل الحفظ — باقٍ ${left}` : `المبالغ الموزعة أكبر من مبلغ الدفعة بـ ${-left}`);
  }
  return total;
}

/**
 * Inside a transaction: reads the invoices touched by a split (old ∪ new),
 * checks each one, and returns the writes to run afterwards. Invoice entries
 * carry only the amount, its date and the log it came from.
 */
async function planAllocation(tx, { paymentId, lp, before, wanted, actor, now }) {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(wanted)])];
  const [orderSnaps, docSnaps] = await Promise.all([
    Promise.all(ids.map((id) => tx.get(adminDb.collection("orders").doc(id)))),
    Promise.all(ids.map((id) => tx.get(adminDb.collection("invoicePayments").doc(id)))),
  ]);
  const [from, to] = dayWindow(lp.day);
  const writes = [];
  ids.forEach((orderId, i) => {
    const want = wanted[orderId] || 0;
    const had = before[orderId] || 0;
    if (want === had) return;
    const os = orderSnaps[i];
    if (!os.exists) throw bad("فاتورة غير موجودة في التوزيع", 404);
    const order = os.data();
    if (order.route !== lp.route || !order.createdAt || order.createdAt < from || order.createdAt > to) throw bad("الفاتورة ليست من هذا السجل");
    if (want > had && order.status === "cancelled") throw bad("لا يمكن توزيع مبلغ على فاتورة ملغاة");
    const data = docSnaps[i].exists ? docSnaps[i].data() : { orderId, route: order.route, clientId: order.clientId || null, payments: [] };
    const others = (data.payments || []).filter((p) => !(p.viaLog === paymentId && !p.voided));
    const room = round2((Number(order.total) || 0) - P.sumPaid(others));
    if (want > room + 1e-9) throw bad(`المبلغ أكبر من المتبقي على فاتورة ${order.number || orderId.slice(-6)} (${room})`);
    const entry = want > 0 ? [{ id: `${paymentId}:${orderId}`.slice(0, 300), viaLog: paymentId, logId: lp.logId, amount: want, date: lp.date, createdAt: now.toISOString(), createdBy: actor.uid }] : [];
    const payments = [...others, ...entry];
    writes.push(() => tx.set(docSnaps[i].ref, { ...data, payments, paidTotal: P.sumPaid(payments), count: P.activePayments(payments).length, updatedAt: now.toISOString() }));
  });
  return writes;
}

/** Record a payment on the log together with its full split (one transaction). */
async function addLogPayment(actor, logId, body, now = new Date()) {
  const log = parseLogId(logId);
  if (!log) throw bad("السجل غير صالح");
  const id = isValidRequestId(body.requestId) ? body.requestId : null;
  if (!id) throw bad("رقم الطلب غير صالح");
  const payment = {
    ref: P.cleanRef(body.ref),
    bank: P.cleanBank(body.bank),
    amount: P.cleanAmount(body.amount),
    date: P.cleanDate(body.date, now),
    note: P.cleanNote(body.note),
  };
  const wanted = cleanAllocations(body.allocations);
  const ref = adminDb.collection(COLL).doc(id);
  if (!body.confirmSimilar) {
    const [similar, saved] = await Promise.all([P.findSimilarRefs(payment.ref, { bank: payment.bank, excludePaymentId: id }), ref.get()]);
    if (similar.length && !saved.exists) return { needsConfirm: true, similar };
  }
  const keyRef = adminDb.collection("paymentRefs").doc(P.refKey(payment.bank, payment.ref));
  return adminDb.runTransaction(async (tx) => {
    const [snap, keySnap] = await Promise.all([tx.get(ref), tx.get(keyRef)]);
    if (snap.exists) {
      if (snap.data().createdBy !== actor.uid) throw bad("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى", 409);
      return { duplicate: true, payment: { id, ...snap.data() } };
    }
    if (keySnap.exists) throw bad("رقم العملية هذا لنفس البنك مسجّل من قبل", 409);
    const total = requireComplete(wanted, payment.amount);
    const lp = { logId, route: log.route, day: log.day, date: payment.date };
    const writes = await planAllocation(tx, { paymentId: id, lp, before: {}, wanted, actor, now });
    const doc = {
      logId,
      route: log.route,
      day: log.day,
      ...payment,
      currency: CURRENCY,
      status: "active",
      allocations: wanted,
      allocatedTotal: total,
      createdAt: now.toISOString(),
      createdBy: actor.uid,
      createdByEmail: actor.email || null,
    };
    writes.forEach((w) => w());
    tx.create(ref, doc);
    tx.set(keyRef, { logId, logPaymentId: id, route: log.route, day: log.day, createdAt: doc.createdAt, amount: payment.amount, date: payment.date, ...P.refFields(payment.bank, payment.ref) });
    writeLogDelta(tx, logId, { receivedC: cents(payment.amount), allocatedC: cents(total), paidC: cents(total) });
    return { duplicate: false, payment: { id, ...doc } };
  });
}

/**
 * 2. Set how a log payment is split between the log's invoices — the full
 * split each time ({ orderId: amount }, 0 or missing = nothing). Invoices
 * whose share changes are updated in the same transaction.
 */
/** Change how an existing payment is split — the new split must use the whole payment. */
async function allocateLogPayment(actor, paymentId, body, now = new Date()) {
  const wanted = cleanAllocations(body && body.allocations);
  const payRef = adminDb.collection(COLL).doc(String(paymentId || ""));
  return adminDb.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists) throw bad("الدفعة غير موجودة", 404);
    const lp = paySnap.data();
    if (lp.status !== "active") throw bad("لا يمكن توزيع دفعة ملغاة");
    const total = requireComplete(wanted, lp.amount);
    const before = lp.allocations || {};
    const writes = await planAllocation(tx, { paymentId, lp, before, wanted, actor, now });
    const oldTotal = sumOf(before);
    writes.forEach((w) => w());
    tx.update(payRef, { allocations: wanted, allocatedTotal: total, allocatedAt: now.toISOString(), allocatedBy: actor.uid });
    writeLogDelta(tx, lp.logId, { allocatedC: cents(total) - cents(oldTotal), paidC: cents(total) - cents(oldTotal) });
    return { payment: { id: paymentId, ...lp, allocations: wanted, allocatedTotal: total } };
  });
}

/** 3. Void a log payment and every share of it. */
async function voidLogPayment(actor, paymentId, body, now = new Date()) {
  const reason = P.cleanNote(body && body.reason);
  if (!reason) throw bad("اكتب سبب الإلغاء");
  const payRef = adminDb.collection(COLL).doc(String(paymentId || ""));
  return adminDb.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists) throw bad("الدفعة غير موجودة", 404);
    const lp = paySnap.data();
    if (lp.status === "voided") return { duplicate: true };
    const ids = Object.keys(lp.allocations || {});
    const docSnaps = await Promise.all(ids.map((id) => tx.get(adminDb.collection("invoicePayments").doc(id))));
    docSnaps.forEach((ds) => {
      if (!ds.exists) return;
      const data = ds.data();
      const payments = (data.payments || []).map((p) => (p.viaLog === paymentId && !p.voided ? { ...p, voided: true, voidedAt: now.toISOString(), voidedBy: actor.uid, voidReason: reason } : p));
      tx.set(ds.ref, { ...data, payments, paidTotal: P.sumPaid(payments), count: P.activePayments(payments).length, updatedAt: now.toISOString() });
    });
    tx.update(payRef, { status: "voided", voidedAt: now.toISOString(), voidedBy: actor.uid, voidReason: reason });
    tx.delete(adminDb.collection("paymentRefs").doc(P.refKey(lp.bank, lp.ref)));
    writeLogDelta(tx, lp.logId, { receivedC: -cents(lp.amount), allocatedC: -cents(lp.allocatedTotal), paidC: -cents(lp.allocatedTotal) });
    return { duplicate: false };
  });
}

/** Everything the log page shows: totals, invoices (client, paid, remaining), payments. */
async function loadLog(logId) {
  const log = parseLogId(logId);
  if (!log) throw bad("السجل غير صالح");
  const [orders, stateSnap, paysSnap] = await Promise.all([
    logOrders(log.route, log.day),
    adminDb.collection(LOG_COLL).doc(logId).get(),
    adminDb.collection(COLL).where("logId", "==", logId).get(),
  ]);
  const ids = orders.map((o) => o.id);
  const clientIds = [...new Set(orders.map((o) => o.clientId).filter(Boolean).map(String))];
  const [payDocs, clientSnaps] = await Promise.all([
    P.paymentDocsFor(ids),
    clientIds.length ? adminDb.getAll(...clientIds.map((id) => adminDb.collection("clients").doc(id))) : [],
  ]);
  const clients = {};
  clientSnaps.forEach((s) => s.exists && (clients[s.id] = s.data()));
  const invoices = orders
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((o) => {
      const c = clients[String(o.clientId)] || {};
      return {
        id: o.id,
        number: o.number || null,
        createdAt: o.createdAt,
        status: o.status,
        clientId: o.clientId || null,
        clientName: c.name || null,
        storeName: c.storeName || null,
        deliveryRoute: c.deliveryRoute || null,
        location: c.location || null,
        phone: c.phone || null,
        ...P.summarize(o, payDocs[o.id]),
      };
    });
  const payments = paysSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(({ createdByEmail, ...p }) => ({ ...p, bankLabel: P.BANK_LABELS[p.bank] || p.bank }));
  const { attachMargins } = require("./accountingViews");
  const [view] = await attachMargins([logView(logId, stateSnap.exists ? stateSnap.data() : { route: log.route, day: log.day })]);
  return { log: view, invoices, payments };
}

module.exports = { addLogPayment, allocateLogPayment, voidLogPayment, loadLog, logOrders, LOG_PAYMENTS: COLL };
