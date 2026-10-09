// Daily summaries (dailyStats): the dashboards read pre-computed day
// documents instead of every invoice, and must show EXACTLY what the
// invoice-by-invoice calculation shows — on the demo history, after live
// invoices are created / edited / cancelled, after a backfill, and after
// the nightly check repairs a damaged day. Also prints the read counts.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
const { sameResult } = require("./statsCompare");
const { generate } = require("../scripts/demo/generate");
const S = require("../lib/salesStats");
const D = require("../lib/dashboardSummary");
const E = require("../lib/executiveSummary");
const { businessDay } = require("../lib/businessDay");
call = async function (rel, { method = "GET", query = {}, body, headers = {}, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, headers: { authorization: t, ...headers } }, res);
  return { status, json };
};
const DAY = 24 * 3600e3;
const ymd = (d) => businessDay(d);

(async () => {
  const d = generate({ months: 4, seed: 7 });
  const put = async (coll, list) => { for (const { id, data } of list) await db.collection(coll).doc(id).set(data); };
  for (const [coll, list] of [["products", d.products], ["clients", d.clients], ["orders", d.orders], ["inventoryDocs", d.inventoryDocs], ["dailyStats", d.dailyStats], ["monthlyStats", d.monthlyStats], ["logState", d.logState], ["invoicePayments", d.invoicePayments], ["logPayments", d.logPayments]]) await put(coll, list);
  // A few old-style lines without a saved unit cost, priced at today's average when read.
  const someOld = d.orders.slice(0, 40).filter((o, i) => i % 3 === 0);
  for (const o of someOld) {
    const items = o.data.items.map((it, i) => (i === 0 ? { ...it, unitCost: null } : it));
    await db.collection("orders").doc(o.id).update({ items });
  }
  const rebuilt = await S.rebuildRange(d.period.from, d.period.to, { write: true });
  assert.ok(rebuilt.daysWithDrift.length > 0 && rebuilt.daysWithDrift.length <= someOld.length, "only the changed days needed fixing");
  await db.collection("meta").doc("statsState").set({ ready: true });
  S.resetReadyCache();

  const now = new Date();
  const today = ymd(now);
  const back = (n) => ymd(new Date(now.getTime() - n * DAY));
  const ranges = [
    {}, { from: back(1), to: back(1) }, { from: back(6), to: today }, { from: back(29), to: today },
    { from: d.period.from, to: today }, { from: back(60), to: back(31) }, { from: back(13), to: back(7) },
  ];
  async function compareAll(label) {
    const now = new Date(); // invoices created by the test itself must be inside "now"
    for (const r of ranges) {
      sameResult(await D.buildSummary(r, now), await D.buildSummaryFromOrders(r, now));
      sameResult(await E.buildOverview(r, now), await E.buildOverviewFromOrders(r, now));
      sameResult(await E.buildCustomers(r, now), await E.buildCustomersFromOrders(r, now));
    }
    for (const k of ["day", "week", "month"]) sameResult(await D.buildTrend(k, now), await D.buildTrendFromOrders(k, now));
    ok(label);
  }
  await compareAll("demo history: manager summary, executive overview & customers (7 ranges each) and the 3 trends equal the invoice-by-invoice figures");

  // live changes go through the real endpoints and update the summaries in the same transaction
  const A1 = { role: "agent_car1", uid: "agent-w" }, A2 = { role: "agent_car2", uid: "agent-r", salesSupervisor: false };
  const c1 = d.clients.find((c) => c.data.route === "car1" && c.data.active !== false);
  const c2 = d.clients.find((c) => c.data.route === "car2" && c.data.active !== false);
  for (const p of d.products) await db.collection("products").doc(p.id).update({ stock: { depot: 500, car1: 500, car2: 500 } });
  const [p1, p2] = d.products;
  const rid = (n) => "req-stats-0000000" + n;
  const mk = async (who, c, n, items, extra = {}) => {
    const r = await call("pages/api/orders/create-staff.js", { ...who, method: "POST", body: { clientId: c.id, items, requestId: rid(n), ...extra } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  };
  await mk(A1, c1, 1, [{ productId: p1.id, qty: 5 }, { productId: p2.id, qty: 2, freeSample: true }], { discount: 777 });
  await mk(A1, c1, 2, [{ productId: p2.id, qty: 3 }]);
  await mk(A2, c2, 3, [{ productId: p1.id, qty: 1 }]);
  const e = await call("pages/api/orders/[id]/items.js", { ...A1, method: "PATCH", query: { id: rid(1) }, body: { items: [{ productId: p1.id, qty: 7 }], discount: 100 } });
  assert.strictEqual(e.status, 200, JSON.stringify(e.json));
  const x = await call("pages/api/orders/[id]/status.js", { ...A1, method: "PATCH", query: { id: rid(2) }, body: { status: "cancelled" } });
  assert.strictEqual(x.status, 200, JSON.stringify(x.json));
  // a locked old invoice edited by the manager lands on ITS day, not today
  const old = d.orders.find((o) => o.data.status !== "cancelled" && o.data.route === "car2" && o.data.createdAt < new Date(now.getTime() - 20 * DAY).toISOString());
  const m = await call("pages/api/orders/[id]/items.js", { role: "manager", uid: "m", method: "PATCH", query: { id: old.id }, body: { items: [{ productId: p2.id, qty: 4 }] } });
  assert.strictEqual(m.status, 200, JSON.stringify(m.json));
  const oldDay = ymd(new Date(old.data.createdAt));
  assert.strictEqual((await S.rebuildDay(oldDay)).diffs.length, 0, "edited day stays exact");
  assert.strictEqual((await S.rebuildDay(today)).diffs.length, 0, "today stays exact");
  await compareAll("after live invoices (discount, free sample), an edit, a cancellation and an edit of a 20-day-old invoice: still identical");

  // nightly check: repairs a damaged day, leaves a good day alone, refuses without the secret
  const yday = back(1);
  await db.collection("dailyStats").doc(yday).set({ day: yday, r: { car1: { inv: 999, units: 1 } } });
  process.env.CRON_SECRET = "s3cret-for-tests";
  const V = "pages/api/cron/verify-stats.js";
  assert.strictEqual((await call(V, { headers: { authorization: "Bearer nope" } })).status, 401);
  const v1 = await call(V, { headers: { authorization: "Bearer s3cret-for-tests" } });
  assert.strictEqual(v1.status, 200, JSON.stringify(v1.json));
  assert.ok(v1.json.repaired && v1.json.days[0].day === yday && v1.json.days[0].fields > 0);
  const v2 = await call(V, { headers: { authorization: "Bearer s3cret-for-tests" } });
  assert.ok(!v2.json.repaired);
  assert.ok(db._data.meta.statsCheck && db._data.meta.statsCheck.repaired === false);
  await compareAll("nightly check found and repaired a damaged day (and its month); second run finds nothing");

  // backfill from nothing
  delete db._data.dailyStats; delete db._data.monthlyStats; delete db._data.meta.statsState; S.resetReadyCache();
  sameResult(await D.buildSummary({}, now), await D.buildSummaryFromOrders({}, now)); // not ready → old path
  const first = await S.firstInvoiceDay();
  const bf = await S.rebuildRange(first, today, { write: true });
  assert.ok(bf.invoices >= d.orders.length);
  await S.markReady();
  await compareAll("backfill from an empty start rebuilds every day and month; numbers identical");

  // reads: before vs after, demo volume (4 months, ~7 invoices a day)
  const measure = async (fn) => { db._resetReads(); await fn(); if (process.env.READS_DEBUG) console.log(JSON.stringify(db._stats.byColl)); return db._stats.reads; };
  const rows = [];
  const add = async (label, newFn, oldFn) => rows.push([label, await measure(oldFn), await measure(newFn)]);
  S.resetReadyCache(); await S.statsReady();
  await add("Manager dashboard — today", () => D.buildSummary({}, now), () => D.buildSummaryFromOrders({}, now));
  await add("Manager dashboard — 30 days", () => D.buildSummary({ from: back(29), to: today }, now), () => D.buildSummaryFromOrders({ from: back(29), to: today }, now));
  await add("Manager trend — daily (30 days)", () => D.buildTrend("day", now), () => D.buildTrendFromOrders("day", now));
  await add("Manager/exec trend — weekly (12 wk)", () => D.buildTrend("week", now), () => D.buildTrendFromOrders("week", now));
  await add("Manager/exec trend — monthly (12 mo)", () => D.buildTrend("month", now), () => D.buildTrendFromOrders("month", now));
  await add("Executive overview — 30 days", () => E.buildOverview({ from: back(29), to: today }, now), () => E.buildOverviewFromOrders({ from: back(29), to: today }, now));
  await add("Executive customers — 30 days", () => E.buildCustomers({ from: back(29), to: today }, now), () => E.buildCustomersFromOrders({ from: back(29), to: today }, now));
  await add("Executive overview — whole history", () => E.buildOverview({ from: d.period.from, to: today }, now), () => E.buildOverviewFromOrders({ from: d.period.from, to: today }, now));
  console.log("\\n  READS (old → new), demo data " + d.orders.length + " invoices / " + d.period.days + " days");
  for (const [l, o, n] of rows) console.log("  " + l.padEnd(40) + String(o).padStart(6) + " → " + String(n).padStart(4));
  global.__READS = rows;
  for (const [l, o, n] of rows.slice(1)) assert.ok(n < o, l);
  ok("dashboards read far fewer documents");

  console.log("ALL DAILY-STATS SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
