// The pure part of lib/salesStats.js — no database access, so the demo
// generator and the tests can build exactly the same day documents.
// See lib/salesStats.js for what each field means.

const { businessDay } = require("./businessDay");
const { netLines } = require("./invoiceDiscount");

const EPS = 1e-9;
const cents = (n) => Math.round((Number(n) || 0) * 100);
const DAYMS = 24 * 3600e3;

// ─── One invoice's contribution ───────────────────────────────────────────
function dayOf(order) {
  return businessDay(new Date(order.createdAt));
}

/** Nested { r, p, c, pn } for one invoice, or null when it counts for nothing. */
function contribution(order) {
  if (!order || order.status === "cancelled" || !order.route || !order.createdAt) return null;
  const route = order.route;
  const R = { inv: 1, units: 0, sdgC: 0, mCost: 0, mRevC: 0, xCost: 0, sCost: 0 };
  const p = {};
  const pn = {};
  let clientSdgC = 0;
  for (const it of netLines(order)) {
    const qty = Number(it.qty) || 0;
    const paid = !it.freeSample;
    const netC = cents(it.netSubtotal);
    const costed = it.unitCost != null;
    const byRoute = (p[it.productId] = p[it.productId] || {});
    const P = (byRoute[route] = byRoute[route] || { n: 0, qty: 0, sdgC: 0, uq: 0, urC: 0, upq: 0 });
    if (pn[it.productId] === undefined && it.name) pn[it.productId] = it.name;
    P.n += 1;
    P.sdgC += netC;
    R.sdgC += netC;
    clientSdgC += netC;
    if (paid) {
      P.qty += qty;
      R.units += qty;
    }
    if (costed) {
      const c = Number(it.unitCost) * qty;
      R.mCost += c;
      R.mRevC += netC;
      if (!paid) R.sCost += c; // agents' free samples, at cost (shown as a margin deduction)
      if (paid) R.xCost += c;
    } else {
      P.uq += qty;
      P.urC += netC;
      if (paid) P.upq += qty;
    }
  }
  const out = { r: { [route]: R }, p, pn };
  if (order.clientId) out.c = { [String(order.clientId)]: { [route]: { inv: 1, units: R.units, sdgC: clientSdgC } } };
  return out;
}

// ─── Small helpers over nested number maps ────────────────────────────────
function deepAdd(target, src, sign = 1) {
  for (const [k, v] of Object.entries(src || {})) {
    if (typeof v === "number") target[k] = (typeof target[k] === "number" ? target[k] : 0) + sign * v;
    else if (typeof v === "string") {
      if (target[k] === undefined) target[k] = v;
    } else if (v && typeof v === "object") deepAdd((target[k] = target[k] && typeof target[k] === "object" ? target[k] : {}), v, sign);
  }
  return target;
}

/** Drops zeros (and float dust) and empty maps; returns null when nothing is left. */
function prune(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === "number") {
      if (Math.abs(v) > EPS) out[k] = v;
    } else if (typeof v === "string") out[k] = v;
    else if (v && typeof v === "object") {
      const inner = prune(v);
      if (inner) out[k] = inner;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Builds day documents (and month totals) from raw invoices — backfill, checks, demo. */
function statsFromOrders(orders) {
  const days = {};
  for (const o of orders) {
    const c = contribution(o);
    if (!c) continue;
    const day = dayOf(o);
    deepAdd((days[day] = days[day] || { day }), c);
  }
  return days;
}

function monthFromDays(dayDocs, month) {
  const r = {};
  for (const d of dayDocs) deepAdd(r, d.r || {});
  return { month, r: prune(r) || {} };
}

function daysBetween(fromYmd, toYmd) {
  const out = [];
  for (let t = Date.parse(`${fromYmd}T12:00:00Z`), end = Date.parse(`${toYmd}T12:00:00Z`); t <= end; t += DAYMS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** The stored shape of a day document built from raw figures. */
function dayDocOf(day, raw) {
  return { day, ...(prune({ r: raw.r, p: raw.p, c: raw.c }) || {}), pn: raw.pn || {} };
}

/** Every day and month document for a set of invoices (backfill, demo data). */
function statsDocsFromOrders(orders) {
  const days = statsFromOrders(orders);
  const dayDocs = Object.keys(days).sort().map((day) => ({ id: day, data: dayDocOf(day, days[day]) }));
  const byMonth = {};
  dayDocs.forEach((d) => (byMonth[d.id.slice(0, 7)] = byMonth[d.id.slice(0, 7)] || []).push(d.data));
  const monthDocs = Object.keys(byMonth).sort().map((m) => ({ id: m, data: monthFromDays(byMonth[m], m) }));
  return { dayDocs, monthDocs };
}

/**
 * Invoice-log totals (logState, lib/invoiceLogs.js) for a set of invoices and
 * their payment documents (by order id) — for the demo data.
 */
function logStatesFromOrders(orders, payDocsById = {}, logPayments = []) {
  const logs = {};
  const days = statsFromOrders(orders.map((o) => o.data || o));
  for (const [day, d] of Object.entries(days)) {
    for (const [route, R] of Object.entries(d.r || {})) logs[`${route}_${day}`] = { route, day, inv: R.inv || 0, totalC: R.sdgC || 0, paidC: 0, receivedC: 0, allocatedC: 0 };
  }
  for (const o of orders) {
    const data = o.data || o;
    const pay = payDocsById[o.id];
    if (!pay || !data.route || !data.createdAt) continue;
    const id = `${data.route}_${dayOf(data)}`;
    const paid = (pay.payments || []).filter((p) => !p.voided).reduce((a, p) => a + Math.round(Number(p.amount || 0) * 100), 0);
    if (!paid) continue;
    logs[id] = logs[id] || { route: data.route, day: dayOf(data), inv: 0, totalC: 0, paidC: 0, receivedC: 0, allocatedC: 0 };
    logs[id].paidC += paid;
  }
  for (const lp of logPayments) {
    if (lp.status !== "active") continue;
    const parts = lp.logIds && lp.allocLogs
      ? Object.entries(lp.allocations || {}).map(([oid, amt]) => [lp.allocLogs[oid], Math.round(Number(amt) * 100), Math.round(Number(amt) * 100)])
      : [[lp.logId, Math.round(Number(lp.amount || 0) * 100), Math.round(Number(lp.allocatedTotal || 0) * 100)]];
    for (const [logId, rc, ac] of parts) {
      const day = logId.slice(logId.length - 10);
      const L = (logs[logId] = logs[logId] || { route: lp.route, day, inv: 0, totalC: 0, paidC: 0, receivedC: 0, allocatedC: 0 });
      L.receivedC += rc;
      L.allocatedC += ac;
    }
  }
  return Object.entries(logs).map(([id, data]) => ({ id, data }));
}

module.exports = { logStatesFromOrders, dayDocOf, statsDocsFromOrders, contribution, deepAdd, prune, statsFromOrders, monthFromDays, dayOf, daysBetween, EPS, DAYMS };
