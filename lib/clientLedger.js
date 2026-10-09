// Per-client running balances (see lib/clientLedgerModel.js for the
// document). Written in the SAME transactions that create / edit / cancel
// an invoice and that record, split or void a payment, as increments — so
// a client's balance is always exactly its invoices minus what was paid.

const { admin, adminDb } = require("./firebaseAdmin");
const { invoiceC, cents, clientBalancesFrom } = require("./clientLedgerModel");

const COLL = "clientBalance";
const inc = (n) => admin.firestore.FieldValue.increment(n);
const refOf = (clientId) => adminDb.collection(COLL).doc(String(clientId));

/** Invoice created / edited / cancelled: total after − before (writes only). */
function writeClientInvoice(tx, orderId, before, after) {
  const o = after || before;
  if (!o || !o.clientId || !orderId) return;
  const delta = invoiceC(after) - invoiceC(before);
  const entry = { at: o.createdAt || null, n: o.number || null };
  if (delta) entry.t = inc(delta);
  else if (before) return; // nothing changed for the balance
  else entry.t = 0;
  tx.set(refOf(o.clientId), { clientId: String(o.clientId), route: o.route || null, inv: { [orderId]: entry }, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Money on an invoice changed by `deltaAmount` SDG (writes only). */
function writeClientPaid(tx, clientId, orderId, deltaAmount) {
  writeClientPaidMany(tx, clientId, { [orderId]: deltaAmount });
}

/** Several invoices of one client in ONE write: { orderId: deltaAmount }. */
function writeClientPaidMany(tx, clientId, deltas) {
  const inv = {};
  for (const [orderId, amt] of Object.entries(deltas || {})) {
    const d = cents(amt);
    if (d) inv[orderId] = { p: inc(d) };
  }
  if (!clientId || !Object.keys(inv).length) return;
  tx.set(refOf(clientId), { clientId: String(clientId), inv, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Collects per-client changes during a transaction and writes each client once. */
function clientPaidCollector() {
  const by = {};
  return {
    add(clientId, orderId, amt) {
      if (!clientId) return;
      const m = (by[String(clientId)] = by[String(clientId)] || {});
      m[orderId] = (m[orderId] || 0) + amt;
    },
    flush(tx) {
      for (const [cid, m] of Object.entries(by)) writeClientPaidMany(tx, cid, m);
    },
  };
}

/**
 * Rebuilds every client's document from the invoices and their payments
 * (backfill / repair). Reads every invoice and payment document once.
 * Returns how many documents differ (and writes them with `write`).
 */
async function rebuildClientBalances({ write = false } = {}) {
  const [orders, pays, stored] = await Promise.all([
    adminDb.collection("orders").get(),
    adminDb.collection("invoicePayments").get(),
    adminDb.collection(COLL).get(),
  ]);
  const payDocs = Object.fromEntries(pays.docs.map((d) => [d.id, d.data()]));
  const fresh = clientBalancesFrom(orders.docs.map((d) => ({ id: d.id, data: d.data() })), payDocs);
  const have = Object.fromEntries(stored.docs.map((d) => [d.id, d.data()]));
  const norm = (doc) => JSON.stringify(Object.entries(doc?.inv || {}).map(([k, v]) => [k, v.t || 0, v.p || 0]).sort());
  const changed = Object.keys({ ...fresh, ...have }).filter((id) => norm(fresh[id]) !== norm(have[id]));
  if (write && changed.length) {
    for (let i = 0; i < changed.length; i += 400) {
      const batch = adminDb.batch();
      changed.slice(i, i + 400).forEach((id) => (fresh[id] ? batch.set(refOf(id), { ...fresh[id], rebuiltAt: new Date().toISOString() }) : batch.delete(refOf(id))));
      await batch.commit();
    }
  }
  return { clients: Object.keys(fresh).length, changed: changed.length };
}

module.exports = { writeClientInvoice, writeClientPaid, writeClientPaidMany, clientPaidCollector, rebuildClientBalances, CLIENT_BALANCE: COLL };
