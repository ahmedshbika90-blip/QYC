// Invoice logs (سجل الفواتير) — one per sales van (route) per business day:
// every invoice an agent made that day. The accountant records the money
// an agent hands over against the LOG (with its transfer reference), then
// distributes it to the clients' invoices inside it (lib/logPayments.js).
//
//   logState/{route}_{YYYY-MM-DD}   running totals, kept in the same
//                                   transactions that change them:
//     inv        invoices (not cancelled)
//     totalC     their total after discounts            (1/100 SDG)
//     paidC      money on those invoices, from any payment (log or direct)
//     receivedC  money recorded against the log itself (log payments)
//     allocatedC of that, distributed to invoices
//   → remaining = total − paid; waiting to distribute = received − allocated
//
// Amounts in 1/100 SDG (integers) so they add up exactly.

const { admin, adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");

const COLL = "logState";
const cents = (n) => Math.round((Number(n) || 0) * 100);
const fromC = (c) => Math.round(Number(c) || 0) / 100;
const LOG_ID = /^(car[0-9a-z_-]{1,30})_(\d{4}-\d{2}-\d{2})$/;

const logIdOf = (route, day) => `${route}_${day}`;
function parseLogId(id) {
  const m = LOG_ID.exec(String(id || ""));
  return m ? { route: m[1], day: m[2] } : null;
}
/** The log an invoice belongs to. */
const logOfOrder = (order) => (order && order.route && order.createdAt ? logIdOf(order.route, businessDay(new Date(order.createdAt))) : null);

/** Adds deltas to a log's totals inside a transaction (writes only). */
function writeLogDelta(tx, logId, delta) {
  const p = parseLogId(logId);
  if (!p) return;
  const inc = admin.firestore.FieldValue.increment;
  const out = {};
  for (const [k, v] of Object.entries(delta)) if (v) out[k] = inc(v);
  if (!Object.keys(out).length) return;
  tx.set(adminDb.collection(COLL).doc(logId), { route: p.route, day: p.day, ...out, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Plain numbers for the screen. */
function logView(id, s = {}) {
  const p = parseLogId(id) || {};
  const total = fromC(s.totalC);
  const paid = fromC(s.paidC);
  const received = fromC(s.receivedC);
  const allocated = fromC(s.allocatedC);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const credit = Math.max(0, Math.round((paid - total) * 100) / 100);
  const status = !s.inv && !paid ? "empty" : remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return {
    id,
    route: s.route || p.route,
    day: s.day || p.day,
    invoices: s.inv || 0,
    total,
    paid,
    remaining,
    credit,
    received,
    allocated,
    toDistribute: Math.max(0, Math.round((received - allocated) * 100) / 100),
    status,
  };
}

module.exports = { COLL, logIdOf, parseLogId, logOfOrder, writeLogDelta, logView, cents, fromC };
