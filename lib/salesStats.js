// Pre-computed sales figures, so dashboards read a handful of small
// documents instead of every invoice in the period.
//
//   dailyStats/{YYYY-MM-DD}   one per business day (Khartoum calendar)
//   monthlyStats/{YYYY-MM}    route totals per month (12-month trend = 12 reads)
//   meta/statsState           { ready: true } once the history is backfilled
//
// A day document holds exactly what the dashboards need to reproduce the
// numbers they used to compute from raw invoices:
//
//   r.{route}       inv, units, sdgC, mCost, mRevC, xCost
//   p.{product}.{route}  n, qty, sdgC, uq, urC, upq
//   c.{client}.{route}   inv, units, sdgC
//   pn.{product}    product name as written on the invoice line
//
//   inv    non-cancelled invoices
//   units  PAID units (free samples excluded)
//   sdgC   revenue after the invoice discount, in 1/100 SDG (integer → exact)
//   mCost / mRevC  cost and revenue of lines that carry their sale-time unit
//                  cost (manager's margin: every line, samples included)
//   xCost  cost of PAID lines that carry a unit cost (executive's figure)
//   n      invoice lines (so a product sold only as a sample still shows)
//   uq / urC / upq  lines WITHOUT a saved unit cost: all qty, revenue, paid
//                  qty. They are priced at the product's CURRENT average cost
//                  when read — exactly what the old code did — so no stored
//                  figure ever goes stale when a cost changes.
//
// Every change to an invoice (create, edit, cancel) adds the difference
// "after − before" to its day — in the SAME transaction as the invoice
// write, as increments, so concurrent invoices never overwrite each other.

const { admin, adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { writeLogDelta, logIdOf } = require("./invoiceLogs");
const { contribution, deepAdd, prune, statsFromOrders, monthFromDays, dayOf, daysBetween, dayDocOf, EPS, DAYMS } = require("./salesStatsModel");

const { UTC_OFFSET } = require("./companyConfig");
const DAY_COLL = "dailyStats";
const MONTH_COLL = "monthlyStats";
const STATE_DOC = () => adminDb.collection("meta").doc("statsState");

function toIncrements(obj) {
  const inc = admin.firestore.FieldValue.increment;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") out[k] = inc(v);
    else if (typeof v === "string") out[k] = v;
    else out[k] = toIncrements(v);
  }
  return out;
}

// ─── Writer (inside the invoice transaction) ──────────────────────────────
/**
 * Adds "after − before" for one invoice to its day and month. Call inside
 * the transaction that writes the invoice, AFTER all its reads (this only
 * writes). before = null for a new invoice; after = the invoice as saved.
 */
function writeInvoiceStats(tx, before, after) {
  const byDay = {};
  for (const [order, sign] of [[before, -1], [after, 1]]) {
    const c = contribution(order);
    if (!c) continue;
    const day = dayOf(order);
    deepAdd((byDay[day] = byDay[day] || {}), c, sign);
  }
  const now = new Date().toISOString();
  for (const [day, raw] of Object.entries(byDay)) {
    const { pn, ...nums } = raw;
    const delta = prune(nums);
    if (!delta) continue;
    tx.set(adminDb.collection(DAY_COLL).doc(day), { day, ...toIncrements(delta), ...(pn ? { pn } : {}), updatedAt: now }, { merge: true });
    // The van's invoice log for that day (lib/invoiceLogs.js): count and total.
    for (const [route, R] of Object.entries(delta.r || {})) writeLogDelta(tx, logIdOf(route, day), { inv: R.inv || 0, totalC: R.sdgC || 0 });
    if (delta.r) tx.set(adminDb.collection(MONTH_COLL).doc(day.slice(0, 7)), { month: day.slice(0, 7), r: toIncrements(delta.r), updatedAt: now }, { merge: true });
  }
}

// ─── Reader ───────────────────────────────────────────────────────────────
async function getDocs(coll, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await adminDb.getAll(...ids.slice(i, i + 100).map((id) => adminDb.collection(coll).doc(id)));
    snaps.forEach((s) => s.exists && out.push(s.data()));
  }
  return out;
}

/** Day documents for these business days (one read each). */
async function loadDays(days) {
  return days.length ? getDocs(DAY_COLL, days) : [];
}
async function loadMonths(months) {
  return months.length ? getDocs(MONTH_COLL, months) : [];
}

/** Sum of day documents → one { r, p, c, pn } object. */
function sumDays(dayDocs) {
  const s = { r: {}, p: {}, c: {}, pn: {} };
  for (const d of dayDocs) deepAdd(s, { r: d.r, p: d.p, c: d.c, pn: d.pn });
  return s;
}

let readyCache = false;
/** True once the history is backfilled (cached per server instance once true). */
async function statsReady() {
  if (readyCache) return true;
  const snap = await STATE_DOC().get();
  readyCache = Boolean(snap.exists && snap.data().ready);
  return readyCache;
}
function resetReadyCache() {
  readyCache = false;
}

/**
 * Stats for an exact time window. Whole business days come from dailyStats;
 * a window that ends part-way through a day (the "same point yesterday"
 * comparison) reads that one partial day from the raw invoices — it's the
 * only way to cut at the same minute.
 */
async function statsForWindow(from, to, now = new Date()) {
  const firstDay = businessDay(from);
  const lastDay = businessDay(to);
  const lastDayEnd = new Date(`${lastDay}T00:00:00${UTC_OFFSET}`).getTime() + DAYMS - 1;
  // A window that runs up to "now" is complete in today's document; only a
  // window cut earlier inside a day needs that day's invoices.
  const partial = to.getTime() < lastDayEnd && to.getTime() < now.getTime();
  const fullDays = daysBetween(firstDay, lastDay).filter((d) => !(partial && d === lastDay));
  const [dayDocs, rawPart] = await Promise.all([
    loadDays(fullDays),
    partial
      ? adminDb
          .collection("orders")
          .where("createdAt", ">=", new Date(`${lastDay}T00:00:00${UTC_OFFSET}`).toISOString())
          .where("createdAt", "<=", to.toISOString())
          .get()
          .then((snap) => Object.values(statsFromOrders(snap.docs.map((d) => d.data()))))
      : Promise.resolve([]),
  ]);
  return sumDays([...dayDocs, ...rawPart]);
}

// ─── Rebuild / verification ───────────────────────────────────────────────
const isCost = (path) => /Cost$/.test(path);
/** Differences between two day documents (ignores names and timestamps). */
function diffStats(stored, fresh) {
  const flat = (o, prefix = "", out = {}) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (prefix === "" && ["day", "month", "pn", "updatedAt", "rebuiltAt"].includes(k)) continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "number") out[path] = v;
      else if (v && typeof v === "object") flat(v, path, out);
    }
    return out;
  };
  const a = flat(stored);
  const b = flat(fresh);
  const diffs = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    const tol = isCost(k) ? Math.max(1e-6, Math.abs(y) * 1e-9) : EPS;
    if (Math.abs(x - y) > tol) diffs.push({ field: k, stored: x, actual: y });
  }
  return diffs;
}

/**
 * Recomputes one business day from its raw invoices and (with write) fixes
 * the stored document. Runs as a transaction that reads the day's invoices,
 * so an invoice saved meanwhile makes it retry instead of being lost.
 */
async function rebuildDay(day, { write = false } = {}) {
  const start = new Date(`${day}T00:00:00${UTC_OFFSET}`);
  const end = new Date(start.getTime() + DAYMS - 1);
  const ref = adminDb.collection(DAY_COLL).doc(day);
  const q = adminDb.collection("orders").where("createdAt", ">=", start.toISOString()).where("createdAt", "<=", end.toISOString());
  const logsQ = adminDb.collection("logState").where("day", "==", day);
  const logPaysQ = adminDb.collection("logPayments").where("day", "==", day);
  const multiPaysQ = adminDb.collection("logPayments").where("days", "array-contains", day);
  return adminDb.runTransaction(async (tx) => {
    const [snap, stored, logsSnap, logPaysSnap1, multiSnap] = await Promise.all([tx.get(q), tx.get(ref), tx.get(logsQ), tx.get(logPaysQ), tx.get(multiPaysQ)]);
    const seenPays = new Map();
    [...logPaysSnap1.docs, ...multiSnap.docs].forEach((d) => seenPays.set(d.id, d));
    const logPaysSnap = { docs: [...seenPays.values()] };
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const payDocs = await Promise.all(orders.map((o) => tx.get(adminDb.collection("invoicePayments").doc(o.id))));
    const fresh = statsFromOrders(orders)[day] || null;
    const freshDoc = fresh ? dayDocOf(day, fresh) : null;
    const storedDoc = stored.exists ? stored.data() : null;
    const diffs = diffStats(storedDoc || {}, freshDoc || {});

    // Invoice logs of this day (lib/invoiceLogs.js), from the same invoices
    // plus their payments and the day's log payments.
    const logs = {};
    const L = (route) => (logs[route] = logs[route] || { route, day, inv: 0, totalC: 0, paidC: 0, receivedC: 0, allocatedC: 0 });
    Object.entries((fresh && fresh.r) || {}).forEach(([route, R]) => Object.assign(L(route), { inv: R.inv || 0, totalC: R.sdgC || 0 }));
    orders.forEach((o, i) => {
      if (!o.route || !payDocs[i].exists) return;
      const paid = (payDocs[i].data().payments || []).filter((p) => !p.voided).reduce((a, p) => a + Math.round(Number(p.amount || 0) * 100), 0);
      if (paid) L(o.route).paidC += paid;
    });
    logPaysSnap.docs.forEach((d) => {
      const lp = d.data();
      if (lp.status !== "active") return;
      if (lp.logIds && lp.allocLogs) {
        // spread over several logs: each log counts the part it received
        for (const [orderId, amt] of Object.entries(lp.allocations || {})) {
          if (lp.allocLogs[orderId] !== `${lp.route}_${day}`) continue;
          const c = Math.round(Number(amt || 0) * 100);
          L(lp.route).receivedC += c;
          L(lp.route).allocatedC += c;
        }
      } else if (lp.day === day) {
        L(lp.route).receivedC += Math.round(Number(lp.amount || 0) * 100);
        L(lp.route).allocatedC += Math.round(Number(lp.allocatedTotal || 0) * 100);
      }
    });
    const storedLogs = Object.fromEntries(logsSnap.docs.map((d) => [d.id, d.data()]));
    const logDiffs = [];
    const keys = ["inv", "totalC", "paidC", "receivedC", "allocatedC"];
    for (const id of new Set([...Object.keys(storedLogs), ...Object.values(logs).map((l) => `${l.route}_${day}`)])) {
      const want = logs[id.slice(0, id.length - day.length - 1)] || null;
      const have = storedLogs[id] || {};
      const changed = keys.filter((k) => Math.round(Number(have[k]) || 0) !== Math.round(Number(want?.[k]) || 0));
      if (changed.length) logDiffs.push({ log: id, fields: changed });
    }

    if (write && diffs.length) {
      if (freshDoc) tx.set(ref, { ...freshDoc, rebuiltAt: new Date().toISOString() });
      else tx.delete(ref);
    }
    if (write && logDiffs.length) {
      for (const { log } of logDiffs) {
        const want = logs[log.slice(0, log.length - day.length - 1)];
        const lref = adminDb.collection("logState").doc(log);
        if (want && (want.inv || want.paidC || want.receivedC)) tx.set(lref, { ...want, rebuiltAt: new Date().toISOString() });
        else tx.delete(lref);
      }
    }
    return { day, invoices: orders.length, diffs: [...diffs, ...logDiffs.map((l) => ({ field: `logState.${l.log}`, stored: null, actual: l.fields.join(",") }))] };
  });
}

/** Re-adds a month's day documents into its monthly total. */
async function rebuildMonth(month, { write = false } = {}) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const refs = daysBetween(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`).map((d) => adminDb.collection(DAY_COLL).doc(d));
  const mref = adminDb.collection(MONTH_COLL).doc(month);
  return adminDb.runTransaction(async (tx) => {
    const snaps = await Promise.all([...refs.map((r) => tx.get(r)), tx.get(mref)]);
    const stored = snaps.pop();
    const fresh = monthFromDays(snaps.filter((s) => s.exists).map((s) => s.data()), month);
    const diffs = diffStats(stored.exists ? stored.data() : {}, fresh);
    if (write && diffs.length) tx.set(mref, { ...fresh, rebuiltAt: new Date().toISOString() });
    return { month, diffs };
  });
}

/** Business day of the oldest invoice, or null when there are none. */
async function firstInvoiceDay() {
  const snap = await adminDb.collection("orders").orderBy("createdAt", "asc").limit(1).get();
  return snap.empty ? null : dayOf(snap.docs[0].data());
}

/**
 * Rebuilds (write) or checks (no write) every day from `fromDay` to `toDay`
 * and then their months. Used by the backfill script and the nightly check.
 * `onDay` reports progress.
 */
async function rebuildRange(fromDay, toDay, { write = false, onDay } = {}) {
  const days = [];
  const months = new Set();
  for (const day of daysBetween(fromDay, toDay)) {
    const r = await rebuildDay(day, { write });
    days.push(r);
    months.add(day.slice(0, 7));
    if (onDay) onDay(r);
  }
  const monthResults = [];
  for (const m of months) monthResults.push(await rebuildMonth(m, { write }));
  return {
    days: days.length,
    invoices: days.reduce((a, d) => a + d.invoices, 0),
    daysWithDrift: days.filter((d) => d.diffs.length),
    monthsWithDrift: monthResults.filter((m) => m.diffs.length),
  };
}

async function markReady(extra = {}) {
  await STATE_DOC().set({ ready: true, at: new Date().toISOString(), ...extra }, { merge: true });
  readyCache = true;
}

module.exports = {
  DAY_COLL,
  MONTH_COLL,
  contribution,
  statsFromOrders,
  monthFromDays,
  writeInvoiceStats,
  daysBetween,
  loadDays,
  loadMonths,
  sumDays,
  statsReady,
  resetReadyCache,
  statsForWindow,
  rebuildDay,
  rebuildMonth,
  diffStats,
  markReady,
  rebuildRange,
  firstInvoiceDay,
  prune,
  dayOf,
};
