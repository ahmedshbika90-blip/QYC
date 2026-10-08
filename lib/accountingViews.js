// What the accountant's screens read: invoice logs for a period, each
// agent's position, and report data. Reads the small logState documents
// (one per van per day), never every invoice.

const { adminDb, adminAuth } = require("./firebaseAdmin");
const { logView, COLL: LOG_COLL } = require("./invoiceLogs");
const { cachedByVersions } = require("./serverCache");
const { BANK_LABELS } = require("./paymentsShared");
const { businessDay } = require("./businessDay");
const { avgCosts } = require("./productCosts");
const { statsReady, loadDays, sumDays } = require("./salesStats");

// Margin (sales after discount − cost of goods) per log, from the daily
// summaries — the same figure as the manager's dashboard. Shown for
// information next to what the agent owes; it is not added to it.
async function attachMargins(logs) {
  if (!logs.length || !(await statsReady())) return logs;
  const { marginStats } = require("./dashboardSummary");
  const days = [...new Set(logs.map((l) => l.day))];
  const [docs, costs] = await Promise.all([loadDays(days), avgCosts()]);
  const byDay = Object.fromEntries(docs.map((d) => [d.day, sumDays([d])]));
  const avgOf = (id) => (typeof costs[id] === "number" ? costs[id] : null);
  return logs.map((l) => {
    const S = byDay[l.day];
    if (!S || !S.r[l.route]) return { ...l, margin: 0, marginPct: null };
    const m = marginStats(S, [l.route], avgOf);
    return { ...l, margin: m.margin, marginPct: m.marginPct };
  });
}

const ROUTES = ["car1", "car2"];
const ROUTE_LABEL = { car1: "جملة", car2: "تجزئة" };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAYMS = 24 * 3600e3;

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/** Sales staff per van, from the accounts (names as the admin saved them). */
async function agentsDirectory() {
  return cachedByVersions("agentsDirectory", ["profiles"], 5 * 60 * 1000, async () => {
    const out = Object.fromEntries(ROUTES.map((r) => [r, []]));
    if (typeof adminAuth.listUsers !== "function") return out;
    let token;
    do {
      const page = await adminAuth.listUsers(1000, token);
      page.users.forEach((u) => {
        const role = u.customClaims?.role;
        if ((role === "agent_car1" || role === "agent_car2") && !u.disabled) {
          out[role === "agent_car1" ? "car1" : "car2"].push({ uid: u.uid, name: u.displayName || u.email || u.uid });
        }
      });
      token = page.pageToken;
    } while (token);
    return out;
  });
}

function period(q, now = new Date()) {
  const to = YMD.test(q.to || "") ? q.to : businessDay(now);
  const from = YMD.test(q.from || "") ? q.from : businessDay(new Date(now.getTime() - 29 * DAYMS));
  if (from > to) throw bad("تاريخ البداية بعد تاريخ النهاية");
  return { from, to };
}

/** Logs in a period (newest first), optionally for one van. One query. */
async function listLogs({ from, to, route }) {
  let q = adminDb.collection(LOG_COLL);
  if (route) {
    if (!ROUTES.includes(route)) throw bad("المندوب غير صالح");
    q = q.where("route", "==", route);
  }
  const snap = await q.where("day", ">=", from).where("day", "<=", to).get();
  const logs = snap.docs
    .map((d) => logView(d.id, d.data()))
    .filter((l) => l.status !== "empty" || l.received > 0)
    .sort((a, b) => b.day.localeCompare(a.day) || a.route.localeCompare(b.route));
  return attachMargins(logs);
}

const sumLogs = (logs) => {
  const t = { logs: logs.length, invoices: 0, total: 0, paid: 0, remaining: 0, credit: 0, received: 0, toDistribute: 0, paidLogs: 0, partialLogs: 0, unpaidLogs: 0, margin: 0, marginPct: null };
  let hasMargin = false;
  for (const l of logs) {
    if (typeof l.margin === "number") {
      hasMargin = true;
      t.margin += l.margin;
    }
    t.invoices += l.invoices;
    t.total += l.total;
    t.paid += l.paid;
    t.remaining += l.remaining;
    t.credit += l.credit;
    t.received += l.received;
    t.toDistribute += l.toDistribute;
    if (l.status === "paid") t.paidLogs++;
    else if (l.status === "partial") t.partialLogs++;
    else if (l.status === "unpaid") t.unpaidLogs++;
  }
  for (const k of ["total", "paid", "remaining", "credit", "received", "toDistribute", "margin"]) t[k] = Math.round(t[k] * 100) / 100;
  if (!hasMargin) t.margin = null;
  else t.marginPct = t.total ? Math.round((t.margin / t.total) * 1000) / 10 : null;
  return t;
};

/**
 * Each agent (van): what he still owes over ALL his logs, money waiting to
 * be distributed, his oldest unpaid day — plus the period's figures.
 */
async function agentsOverview(q, now = new Date()) {
  const p = period(q, now);
  const [dir, ...perRoute] = await Promise.all([
    agentsDirectory(),
    ...ROUTES.map((r) => adminDb.collection(LOG_COLL).where("route", "==", r).get()),
  ]);
  const agents0 = ROUTES.map((route, i) => {
    const all = perRoute[i].docs.map((d) => logView(d.id, d.data())).filter((l) => l.status !== "empty" || l.received > 0);
    const inPeriod = all.filter((l) => l.day >= p.from && l.day <= p.to);
    return { route, i, all, inPeriod };
  });
  const withMargins = await Promise.all(agents0.map((a) => attachMargins(a.inPeriod)));
  const agents = agents0.map(({ route, all }, k) => {
    const inPeriod = withMargins[k];
    const open = all.filter((l) => l.remaining > 0).sort((a, b) => a.day.localeCompare(b.day));
    return {
      route,
      label: ROUTE_LABEL[route],
      people: dir[route] || [],
      allTime: sumLogs(all),
      period: sumLogs(inPeriod),
      openLogs: open.length,
      oldestOpen: open[0]?.day || null,
      lastDay: all.map((l) => l.day).sort().pop() || null,
    };
  });
  const merge = (key) => {
    const out = {};
    for (const a of agents) for (const [k, v] of Object.entries(a[key])) if (typeof v === "number") out[k] = Math.round(((out[k] || 0) + v) * 100) / 100;
    out.marginPct = typeof out.margin === "number" && out.total ? Math.round((out.margin / out.total) * 1000) / 10 : null;
    return out;
  };
  return { period: p, agents, combined: { allTime: merge("allTime"), period: merge("period") } };
}

/** Report: logs per day + the period's log payments, for one van or all. */
async function reportData(q, now = new Date()) {
  const p = period(q, now);
  const route = q.route && q.route !== "all" ? q.route : null;
  let pq = adminDb.collection("logPayments");
  if (route) pq = pq.where("route", "==", route);
  const [logs, paySnap, dir] = await Promise.all([listLogs({ ...p, route }), pq.where("day", ">=", p.from).where("day", "<=", p.to).get(), agentsDirectory()]);
  const payments = paySnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.status === "active")
    .sort((a, b) => b.day.localeCompare(a.day) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((x) => ({ id: x.id, logId: x.logId, route: x.route, day: x.day, date: x.date, ref: x.ref, bank: x.bank, bankLabel: BANK_LABELS[x.bank] || x.bank, amount: x.amount, allocatedTotal: x.allocatedTotal || 0, note: x.note || null }));
  return { period: p, route, label: route ? ROUTE_LABEL[route] : "كل المناديب", people: route ? dir[route] || [] : Object.values(dir).flat(), logs, totals: sumLogs(logs), payments };
}

module.exports = { attachMargins, agentsDirectory, listLogs, agentsOverview, reportData, period, sumLogs, ROUTE_LABEL };
