// Money returns (رد مبلغ): after a refund, an invoice can hold CREDIT —
// more paid than its new total. The agent who made the refund asks the
// accountant to give that money back; the accountant approves it, saying
// how it was paid back (bank transfer with its reference, or cash). Only
// then does the credit go and a fully refunded invoice become simply
// "refunded".
//
//   moneyReturns/{requestId}
//     { route, items: [{ orderId, number, clientId, clientName, amount }],
//       total, status: pending | approved | rejected, requestedBy,
//       requestedAt, method, bank, ref, date, note, decidedBy, decidedAt }
// On approval each invoice gets a NEGATIVE payment entry (kind "return"),
// in one transaction with the log and client-balance totals.

const { adminDb } = require("./firebaseAdmin");
const { isValidRequestId } = require("./requestId");
const P = require("./payments");
const { writeLogDelta, logOfOrder, cents } = require("./invoiceLogs");
const { clientPaidCollector } = require("./clientLedger");
const { CURRENCY } = require("./companyConfig");

const COLL = "moneyReturns";
const round2 = (n) => Math.round(Number(n) * 100) / 100;
function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };
const creditOf = (order, payDoc) => round2(P.sumPaid(payDoc?.payments || []) - (order.status === "cancelled" ? 0 : Number(order.total) || 0));

/** The agent's invoices that hold credit (and aren't already in a pending request). */
async function returnCandidates(decoded) {
  const route = decoded.route;
  if (!route) throw bad("Forbidden: insufficient role", 403);
  const pays = await adminDb.collection("invoicePayments").where("route", "==", route).get();
  const docs = pays.docs.filter((d) => !d.data().pendingReturnId);
  if (!docs.length) return [];
  const orders = await adminDb.getAll(...docs.map((d) => adminDb.collection("orders").doc(d.id)));
  const rows = [];
  orders.forEach((os, i) => {
    if (!os.exists) return;
    const o = os.data();
    const credit = creditOf(o, docs[i].data());
    if (credit > 0) rows.push({ orderId: os.id, number: o.number || null, clientId: o.clientId || null, createdAt: o.createdAt, refundStatus: o.refundStatus || null, total: o.status === "cancelled" ? 0 : o.total, paid: P.sumPaid(docs[i].data().payments), credit });
  });
  const ids = [...new Set(rows.map((r) => String(r.clientId)).filter(Boolean))];
  const snaps = ids.length ? await adminDb.getAll(...ids.map((id) => adminDb.collection("clients").doc(id))) : [];
  const names = Object.fromEntries(snaps.filter((s) => s.exists).map((s) => [s.id, s.data().name]));
  return rows.map((r) => ({ ...r, clientName: names[String(r.clientId)] || null })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Agent: ask the accountant to give back the credit on these invoices. */
async function requestReturn(decoded, body = {}) {
  const route = decoded.route;
  if (!route) throw bad("Forbidden: insufficient role", 403);
  if (!isValidRequestId(body.requestId)) throw bad("طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى");
  const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))];
  if (!ids.length) throw bad("اختر فاتورة واحدة على الأقل");
  if (ids.length > 50) throw bad("عدد الفواتير كبير جدًا");
  const ref = adminDb.collection(COLL).doc(body.requestId);
  const note = P.cleanNote(body.note);
  return adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return { duplicate: true, id: ref.id };
    const [orders, pays] = await Promise.all([
      Promise.all(ids.map((id) => tx.get(adminDb.collection("orders").doc(id)))),
      Promise.all(ids.map((id) => tx.get(adminDb.collection("invoicePayments").doc(id)))),
    ]);
    const clientIds = [...new Set(orders.filter((o) => o.exists).map((o) => String(o.data().clientId)))];
    const clients = await Promise.all(clientIds.map((c) => tx.get(adminDb.collection("clients").doc(c))));
    const names = Object.fromEntries(clients.filter((c) => c.exists).map((c) => [c.id, c.data().name]));
    const items = ids.map((id, i) => {
      if (!orders[i].exists) throw bad("فاتورة غير موجودة", 404);
      const o = orders[i].data();
      if (o.route !== route) throw bad("غير مصرح: هذه الفاتورة خارج مسارك", 403);
      if (pays[i].exists && pays[i].data().pendingReturnId) throw bad(`يوجد طلب رد مبلغ معلق للفاتورة ${o.number || id}`, 409);
      const credit = creditOf(o, pays[i].exists ? pays[i].data() : null);
      if (credit <= 0) throw bad(`لا يوجد مبلغ زائد على الفاتورة ${o.number || id}`);
      return { orderId: id, number: o.number || null, clientId: o.clientId || null, clientName: names[String(o.clientId)] || null, amount: credit };
    });
    const now = new Date().toISOString();
    const doc = { route, items, total: round2(items.reduce((a, x) => a + x.amount, 0)), currency: CURRENCY, note, status: "pending", requestedBy: decoded.uid, requestedByName: decoded.name || decoded.email || null, requestedAt: now };
    tx.create(ref, doc);
    pays.forEach((p) => tx.update(p.ref, { pendingReturnId: ref.id }));
    return { duplicate: false, id: ref.id, request: doc };
  });
}

/** Accountant: approve (money given back) or reject a request. */
async function decideReturn(decoded, id, body = {}, now = new Date()) {
  const ref = adminDb.collection(COLL).doc(String(id || ""));
  const approve = body.action === "approve";
  if (!approve && body.action !== "reject") throw bad("إجراء غير معروف");
  let payout = null;
  if (approve) {
    const method = body.method === "cash" ? "cash" : "bank";
    payout = { method, date: P.cleanDate(body.date, now), note: P.cleanNote(body.note) };
    if (method === "bank") {
      payout.bank = P.cleanBank(body.bank);
      payout.ref = P.cleanRef(body.ref);
    }
  }
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw bad("الطلب غير موجود", 404);
    const r = snap.data();
    if (r.status !== "pending") return { duplicate: true, status: r.status };
    const ids = r.items.map((x) => x.orderId);
    const [orders, pays] = await Promise.all([
      Promise.all(ids.map((oid) => tx.get(adminDb.collection("orders").doc(oid)))),
      Promise.all(ids.map((oid) => tx.get(adminDb.collection("invoicePayments").doc(oid)))),
    ]);
    const stamp = now.toISOString();
    if (!approve) {
      pays.forEach((p) => p.exists && tx.update(p.ref, { pendingReturnId: null }));
      tx.update(ref, { status: "rejected", decidedBy: decoded.uid, decidedAt: stamp, decisionNote: P.cleanNote(body.note) });
      return { status: "rejected" };
    }
    // The credit may have changed since the request (another payment or
    // refund): give back exactly what is credit NOW, never more.
    const clients = clientPaidCollector();
    const logs = {};
    const given = [];
    r.items.forEach((x, i) => {
      const o = orders[i].data();
      const data = pays[i].data();
      const amount = Math.min(x.amount, creditOf(o, data));
      if (amount <= 0) throw bad(`لم يعد على الفاتورة ${x.number || x.orderId} مبلغ زائد — ارفض الطلب`);
      const entry = { id: `ret:${ref.id}`, kind: "return", returnId: ref.id, amount: -amount, date: payout.date, createdAt: stamp, createdBy: decoded.uid };
      const payments = [...(data.payments || []), entry];
      tx.update(pays[i].ref, { payments, paidTotal: P.sumPaid(payments), count: P.activePayments(payments).length, pendingReturnId: null, updatedAt: stamp });
      if (o.refundStatus === "awaitingMoney") tx.update(orders[i].ref, { refundStatus: "full", moneyReturnedAt: stamp });
      clients.add(o.clientId, x.orderId, -amount);
      const logId = logOfOrder(o);
      logs[logId] = (logs[logId] || 0) - cents(amount);
      given.push({ ...x, amount });
    });
    clients.flush(tx);
    for (const [logId, d] of Object.entries(logs)) writeLogDelta(tx, logId, { paidC: d });
    const total = round2(given.reduce((a, x) => a + x.amount, 0));
    tx.update(ref, { status: "approved", items: given, total, ...payout, decidedBy: decoded.uid, decidedAt: stamp });
    return { status: "approved", total };
  });
}

async function listReturns({ status } = {}) {
  let q = adminDb.collection(COLL);
  if (status) q = q.where("status", "==", status);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt))).slice(0, 200);
}

module.exports = { returnCandidates, requestReturn, decideReturn, listReturns, creditOf, MONEY_RETURNS: COLL };
