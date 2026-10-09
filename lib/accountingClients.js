// Client statements, ageing and collections for the accountant.

const { adminDb } = require("./firebaseAdmin");
const { balanceView, AGE_BUCKETS } = require("./clientLedgerModel");
const { CLIENT_BALANCE } = require("./clientLedger");
const { BANK_LABELS } = require("./paymentsShared");
const { businessDay } = require("./businessDay");

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ROUTES = ["car1", "car2"];
function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
const round2 = (n) => Math.round(n * 100) / 100;

async function namesFor(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await adminDb.getAll(...ids.slice(i, i + 300).map((id) => adminDb.collection("clients").doc(String(id))));
    snaps.forEach((s) => s.exists && (out[s.id] = s.data()));
  }
  return out;
}

/**
 * Every client with what they owe, how old it is (0–30 / 31–60 / 61–90 /
 * 90+ days) and their oldest unpaid invoice. One small document per client.
 */
async function clientBalances({ route, all = false, now = new Date() } = {}) {
  if (route && !ROUTES.includes(route)) throw bad("المندوب غير صالح");
  const snap = await adminDb.collection(CLIENT_BALANCE).get();
  const rows = snap.docs
    .map((d) => ({ id: d.id, route: d.data().route, ...balanceView(d.data(), now) }))
    .filter((r) => (!route || r.route === route) && (all || r.balance > 0 || r.credit > 0));
  const info = await namesFor(rows.map((r) => r.id));
  const clients = rows
    .map((r) => {
      const c = info[r.id] || {};
      return { ...r, name: c.name || null, storeName: c.storeName || null, deliveryRoute: c.deliveryRoute || null, location: c.location || null, phone: c.phone || null };
    })
    .sort((a, b) => b.balance - a.balance || String(a.name).localeCompare(String(b.name), "ar"));
  const totals = { balance: 0, credit: 0, clients: 0, ageing: Object.fromEntries(AGE_BUCKETS.map(([k]) => [k, 0])) };
  for (const c of clients) {
    totals.balance += c.balance;
    totals.credit += c.credit;
    if (c.balance > 0) totals.clients += 1;
    for (const [k, v] of Object.entries(c.ageing)) totals.ageing[k] += v;
  }
  totals.balance = round2(totals.balance);
  totals.credit = round2(totals.credit);
  for (const k of Object.keys(totals.ageing)) totals.ageing[k] = round2(totals.ageing[k]);
  return { clients, totals };
}

/**
 * كشف حساب: every invoice (debit) and every amount received (credit) for
 * one client, oldest first, with the running balance — plus ageing.
 */
async function clientStatement(clientId, now = new Date()) {
  const id = String(clientId || "");
  if (!id) throw bad("العميل غير صالح");
  const [clientSnap, ordersSnap, paysSnap, balSnap] = await Promise.all([
    adminDb.collection("clients").doc(id).get(),
    adminDb.collection("orders").where("clientId", "==", id).get(),
    adminDb.collection("invoicePayments").where("clientId", "==", id).get(),
    adminDb.collection(CLIENT_BALANCE).doc(id).get(),
  ]);
  if (!clientSnap.exists) throw bad("العميل غير موجود", 404);
  const c = clientSnap.data();
  const lines = [];
  const orders = {};
  ordersSnap.docs.forEach((d) => {
    const o = d.data();
    orders[d.id] = o;
    lines.push({ kind: "invoice", at: o.createdAt, orderId: d.id, number: o.number || null, debit: o.status === "cancelled" ? 0 : Number(o.total) || 0, cancelled: o.status === "cancelled", logId: o.route && o.createdAt ? `${o.route}_${businessDay(new Date(o.createdAt))}` : null });
  });
  paysSnap.docs.forEach((d) => {
    for (const p of d.data().payments || []) {
      if (p.voided) continue;
      lines.push({ kind: "payment", at: p.createdAt || `${p.date}T12:00:00Z`, date: p.date, orderId: d.id, number: orders[d.id]?.number || null, credit: Number(p.amount) || 0, logId: p.logId || null, bank: p.bank ? BANK_LABELS[p.bank] || p.bank : null });
    }
  });
  lines.sort((a, b) => String(a.at).localeCompare(String(b.at)) || (a.kind === "invoice" ? -1 : 1));
  let running = 0;
  for (const l of lines) {
    running = round2(running + (l.debit || 0) - (l.credit || 0));
    l.balance = running;
  }
  return {
    client: { id, name: c.name || null, storeName: c.storeName || null, route: c.route || null, deliveryRoute: c.deliveryRoute || null, location: c.location || null, phone: c.phone || null },
    summary: balanceView(balSnap.exists ? balSnap.data() : {}, now),
    invoiced: round2(lines.reduce((a, l) => a + (l.debit || 0), 0)),
    paid: round2(lines.reduce((a, l) => a + (l.credit || 0), 0)),
    lines,
  };
}

/**
 * التحصيل: money received in a period by the date it was RECEIVED (the
 * transfer date), whatever day the invoices were from — per day, per bank,
 * per agent, and every payment. One query.
 */
async function collections({ from, to, route } = {}) {
  if (!YMD.test(from || "") || !YMD.test(to || "") || from > to) throw bad("الفترة غير صالحة");
  if (route && !ROUTES.includes(route)) throw bad("المندوب غير صالح");
  const snap = await adminDb.collection("logPayments").where("date", ">=", from).where("date", "<=", to).get();
  const payments = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.status === "active" && (!route || p.route === route))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((p) => ({ id: p.id, date: p.date, route: p.route, bank: p.bank, bankLabel: BANK_LABELS[p.bank] || p.bank, ref: p.ref, amount: p.amount, logIds: p.logIds || [p.logId], note: p.note || null }));
  const sumBy = (key) => {
    const m = {};
    for (const p of payments) m[p[key]] = round2((m[p[key]] || 0) + p.amount);
    return m;
  };
  return {
    period: { from, to },
    total: round2(payments.reduce((a, p) => a + p.amount, 0)),
    count: payments.length,
    byDay: Object.entries(sumBy("date")).sort((a, b) => b[0].localeCompare(a[0])).map(([date, amount]) => ({ date, amount })),
    byBank: Object.entries(sumBy("bank")).sort((a, b) => b[1] - a[1]).map(([bank, amount]) => ({ bank, bankLabel: BANK_LABELS[bank] || bank, amount })),
    byRoute: Object.entries(sumBy("route")).map(([r, amount]) => ({ route: r, amount })),
    payments,
  };
}

module.exports = { clientBalances, clientStatement, collections };
