// The pure part of lib/clientLedger.js (no database access) — shared by the
// app, the backfill and the demo data generator.
//
//   clientBalance/{clientId}
//     { clientId, route, inv: { [orderId]: { t, p, at, n } } }
//       t   invoice total in 1/100 SDG (0 once cancelled)
//       p   paid on it in 1/100 SDG
//       at  invoice date (createdAt) — for ageing
//       n   legal invoice number, for the statement
//
// One small document per client: the client list, balances and ageing read
// one document per client instead of every invoice.

const cents = (n) => Math.round((Number(n) || 0) * 100);
const invoiceC = (o) => (o && o.status !== "cancelled" ? cents(o.total) : 0);
const paidC = (payDoc) => (payDoc?.payments || []).filter((p) => !p.voided).reduce((a, p) => a + cents(p.amount), 0);

/** Every client's document from all invoices and their payment documents. */
function clientBalancesFrom(orders, payDocsById = {}) {
  const out = {};
  for (const o of orders) {
    const d = o.data || o;
    if (!d.clientId) continue;
    const cid = String(d.clientId);
    const doc = (out[cid] = out[cid] || { clientId: cid, route: d.route || null, inv: {} });
    doc.route = d.route || doc.route;
    doc.inv[o.id] = { t: invoiceC(d), p: paidC(payDocsById[o.id]), at: d.createdAt || null, n: d.number || null };
  }
  return out;
}

const AGE_BUCKETS = [
  ["0-30", 0, 30],
  ["31-60", 31, 60],
  ["61-90", 61, 90],
  ["90+", 91, Infinity],
];

/** Balance, credit, open invoices and ageing (by invoice age, in days) for one client document. */
function balanceView(doc, now = new Date()) {
  const ages = Object.fromEntries(AGE_BUCKETS.map(([k]) => [k, 0]));
  let balanceC = 0;
  let creditC = 0;
  let open = 0;
  let oldest = null;
  for (const [, x] of Object.entries(doc?.inv || {})) {
    const due = (x.t || 0) - (x.p || 0);
    if (due < 0) creditC += -due;
    if (due <= 0) continue;
    balanceC += due;
    open += 1;
    const age = x.at ? Math.max(0, Math.floor((now.getTime() - Date.parse(x.at)) / 864e5)) : 0;
    const bucket = AGE_BUCKETS.find(([, a, b]) => age >= a && age <= b)[0];
    ages[bucket] += due;
    if (x.at && (!oldest || x.at < oldest)) oldest = x.at;
  }
  const toSdg = (c) => Math.round(c) / 100;
  return {
    balance: toSdg(balanceC),
    credit: toSdg(creditC),
    openInvoices: open,
    oldestOpen: oldest,
    oldestDays: oldest ? Math.floor((now.getTime() - Date.parse(oldest)) / 864e5) : null,
    ageing: Object.fromEntries(Object.entries(ages).map(([k, v]) => [k, toSdg(v)])),
  };
}

module.exports = { clientBalancesFrom, balanceView, AGE_BUCKETS, invoiceC, paidC, cents };
