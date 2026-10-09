// Supervisor dashboard summary: periods (Sudan time, week from Saturday)
// and the figures, checked against hand-computed numbers.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  const DS = require("../lib/dashboardSummary");
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const A1x = { role: "agent_car1", uid: "agentA" };
  const API = "pages/api/dashboard/summary.js";
  const iso = (d) => d.toISOString();

  // 1. Date ranges (Sudan calendar, UTC+2) and trend buckets.
  const sun = new Date("2026-10-04T10:00:00Z"); // Sunday 12:00 Khartoum
  const R = (f, t) => DS.rangeFromDates(f, t, sun);
  assert.deepStrictEqual([iso(R().from), iso(R().to), R().days], ["2026-10-03T22:00:00.000Z", iso(sun), 1]); // default: today so far
  assert.strictEqual(iso(R().prev.from), "2026-10-02T22:00:00.000Z"); // vs yesterday, same hours
  assert.strictEqual(iso(R().prev.to), "2026-10-03T10:00:00.000Z");
  assert.deepStrictEqual([iso(R("2026-10-02").from), iso(R("2026-10-02").to)], ["2026-10-01T22:00:00.000Z", "2026-10-02T21:59:59.999Z"]); // one past day
  assert.strictEqual(R("2026-10-01", "2026-10-04").days, 4);
  assert.strictEqual(iso(R("2026-10-01", "2026-10-04").prev.from), "2026-09-26T22:00:00.000Z"); // the 4 days before
  assert.strictEqual(iso(R("2026-10-04", "2026-12-31").to), iso(sun)); // never past "now"
  assert.throws(() => R("2026-10-04", "2026-10-01"), /بعد/); // from after to
  assert.throws(() => R("2026-13-01"), /غير صالح/);
  const days = DS.trendBuckets("day", sun), weeks = DS.trendBuckets("week", sun), months = DS.trendBuckets("month", sun);
  assert.deepStrictEqual([days.length, iso(days[29].from), iso(days[0].from)], [30, "2026-10-03T22:00:00.000Z", "2026-08-30T22:00:00.000Z"]); // 30 working days — Fridays skipped
  assert.ok(days.every((d) => new Date(d.from.getTime() + 2 * 3600e3).getUTCDay() !== 5));
  assert.deepStrictEqual([weeks.length, iso(weeks[11].from)], [12, "2026-10-02T22:00:00.000Z"]); // this week began Saturday 3 Oct
  assert.ok(weeks.every((w) => new Date(w.from.getTime() + 2 * 3600e3).getUTCDay() === 6)); // every bucket starts on a Saturday
  assert.deepStrictEqual([months.length, iso(months[11].from), iso(months[0].from)], [12, "2026-09-30T22:00:00.000Z", "2025-10-31T22:00:00.000Z"]); // Nov 2025 … Oct 2026
  ok("date ranges follow Sudan's calendar (inclusive, capped at now, like-for-like comparison); trend buckets: 30 working days (no Fridays) / 12 Saturday-weeks / 12 months");

  // 2. Seed.
  const y0 = new Date(DS.rangeFromDates().from.getTime() - 24 * 3600e3);
  const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
  const nowish = new Date(Date.now() - 1000).toISOString();
  const yday = new Date(y0.getTime() + 3 * 3600e3).toISOString(); // yesterday 03:00
  const before = new Date(y0.getTime() - 21 * 3600e3).toISOString(); // the day before, 03:00
  await db.collection("products").doc("tah").set({ name: "طحنية", category: "طحنية", unit: "ctn", active: true, stock: { depot: 100, car1: 20, car2: 5 }, minStock: 150 });
  await db.collection("products").doc("chp").set({ name: "شيبسيانو كبير", category: "شبس", unit: "ctn", active: true, stock: { depot: 50, car1: 10, car2: 2 }, minStock: 20 });
  await db.collection("products").doc("old").set({ name: "طحينة قديمة", category: "طحينة", unit: "ctn", active: false, stock: { depot: 0, car1: 0, car2: 0 } });
  for (const [id, name] of [["c1", "عميل أ"], ["c2", "عميل ب"], ["c3", "عميل ج"]]) await db.collection("clients").doc(id).set({ name });
  const L = (productId, name, qty, subtotal, unitCost, extra) => ({ productId, name, qty, price: qty ? subtotal / qty : 0, subtotal, unitCost, ...(extra || {}) });
  const O = (id, route, clientId, createdAt, items, extra) => db.collection("orders").doc(id).set({ route, clientId, createdAt, status: "active", items, ...(extra || {}) });
  // today
  await O("o1", "car1", "c1", nowish, [L("tah", "طحنية", 10, 1000, 60), L("chp", "شيبسيانو كبير", 5, 250, 30)], { discount: 50 });
  await O("o2", "car1", "c2", nowish, [L("tah", "طحنية", 4, 400, 60)]);
  await O("o3", "car2", "c3", nowish, [L("chp", "شيبسيانو كبير", 6, 360, 30), L("tah", "طحنية", 2, 0, 60, { freeSample: true })]);
  await O("o4", "car2", "c2", nowish, [L("chp", "شيبسيانو كبير", 2, 120, 30)], { status: "cancelled" });
  await O("o5", "car2", "c3", nowish, [L("old", "طحينة قديمة", 3, 300, 100)]);
  // yesterday + the day before (for the like-for-like change)
  await O("o6", "car1", "c1", yday, [L("tah", "طحنية", 5, 500, 60)]);
  await O("o7", "car2", "c3", yday, [L("chp", "شيبسيانو كبير", 3, 180, 30)]);
  await O("o8", "car1", "c1", before, [L("tah", "طحنية", 4, 400, 60)]);
  // stock documents finalized today (+ ones that must NOT count)
  const D = (id, type, route, status, finalizedAt, qty) => db.collection("inventoryDocs").doc(id).set({ type, route, status, finalizedAt, items: [{ productId: "tah", qty }] });
  await D("d1", "loading", "car1", "confirmed", nowish, 7);
  await D("d2", "loading", "car2", "confirmed", nowish, 3);
  await D("d3", "received", null, "confirmed", nowish, 40);
  await D("d4", "transfer", null, "confirmed", nowish, 5);
  await D("d5", "loading", "car1", "pending", nowish, 99);   // not finalized
  await D("d6", "loading", "car1", "confirmed", yday, 88);   // yesterday

  // 3. Access.
  assert.strictEqual((await call(API, { ...A1x })).status, 403);
  assert.strictEqual((await call(API, { ...WK })).status, 403);
  assert.strictEqual((await call(API, { ...SUP, method: "POST" })).status, 405);
  assert.strictEqual((await call(API, { ...SUP, query: { from: "2026-02-31x" } })).status, 400);
  assert.strictEqual((await call(API, { ...SUP, query: { from: ymd(new Date()), to: ymd(y0) } })).status, 400); // from after to
  assert.strictEqual((await call("pages/api/dashboard/trend.js", { ...A1x })).status, 403);
  assert.strictEqual((await call("pages/api/dashboard/trend.js", { ...SUP, query: { bucket: "decade" } })).status, 400);
  ok("only the supervisor can read the dashboard and its trend; bad dates / bucket refused");

  // 4. Today's figures, hand-computed.
  const t = await call(API, { ...SUP, query: {} }); // default: today
  assert.strictEqual(t.status, 200, JSON.stringify(t.json));
  const s = t.json, P = (id) => s.products.find((p) => p.id === id);
  // cartons: paid goods only (the free sample and the cancelled invoice are excluded)
  assert.deepStrictEqual([s.totals.w.qty, s.totals.r.qty], [19, 9]);
  // revenue after the invoice discount (50 spread 40/10 over the lines): 1200 + 400 | 360 + 0 + 300
  assert.deepStrictEqual([s.totals.w.sdg, s.totals.r.sdg], [1600, 660]);
  assert.deepStrictEqual([s.totals.w.invoices, s.totals.r.invoices], [2, 2]); // cancelled one not counted
  assert.deepStrictEqual([s.totals.w.avgInvoice, s.totals.r.avgInvoice], [800, 330]);
  // per product: the discount is spread over the lines, so products add up to the channel totals
  assert.deepStrictEqual([P("tah").w.qty, P("tah").w.sdg, P("chp").w.qty, P("chp").w.sdg], [14, 1360, 5, 240]);
  assert.deepStrictEqual([P("chp").r.qty, P("chp").r.sdg, P("tah").r.qty], [6, 360, 0]); // the sample isn't a sale
  assert.strictEqual(s.products.reduce((a, p) => a + p.w.sdg + p.r.sdg, 0), 2260); // 1600 + 660
  ok("today: cartons exclude free samples and cancelled invoices; revenue is net of the invoice discount and adds up per product");

  // 5. Margin from LIVE (unlocked) invoices; a free sample costs margin.
  assert.deepStrictEqual([s.totals.w.margin, s.totals.r.margin], [610, 60]); // 1600−990 | 660−(180+120+300)
  ok("margin is computed from live invoices; the free sample's cost reduces it");

  // 6. Groups, inactive-but-sold product, stock snapshot, low flag.
  assert.deepStrictEqual([P("tah").group.id, P("chp").group.id, P("old").group.id], ["alwafi", "snacks", "alwafi"]);
  assert.ok(s.products.some((p) => p.id === "old" && p.active === false && p.r.qty === 3)); // sold today, so it stays in the totals
  assert.deepStrictEqual(s.products.map((p) => p.group.id), ["alwafi", "alwafi", "snacks"]); // alwafi first
  assert.deepStrictEqual([P("tah").stock.depot, P("tah").stock.car1, P("tah").stock.car2], [100, 20, 5]);
  assert.deepStrictEqual([P("tah").lowDepot, P("chp").lowDepot], [true, false]); // 100 < 150; 50 ≥ 20
  ok("categories roll up to Alwafi / snacks; an inactive product that sold still counts; stock snapshot and low-stock flag");

  // 7. Customer concentration (by revenue).
  assert.strictEqual(s.customers.w.count, 2);
  assert.deepStrictEqual(s.customers.w.top.map((c) => [c.name, Math.round(c.share)]), [["عميل أ", 75], ["عميل ب", 25]]);
  assert.strictEqual(Math.round(s.customers.w.top3), 100);
  assert.strictEqual(s.customers.w.others, null);
  assert.deepStrictEqual([s.customers.r.count, Math.round(s.customers.r.top[0].share)], [1, 100]); // the cancelled invoice's client doesn't appear
  ok("customer concentration: shares by revenue, cumulative, top-3, names resolved; cancelled invoices excluded");

  // 8. Stock movement in the period: only confirmed documents finalized in it.
  assert.deepStrictEqual(s.movement, { w: { in: 7, out: 19 }, r: { in: 3, out: 9 }, depot: { in: 40, out: 15 } });
  ok("movement: vans loaded vs sold; depot received vs issued (loadings + transfers); pending and past documents ignored");

  // 9. Change vs the previous window; multi-day ranges.
  const y = (await call(API, { ...SUP, query: { from: ymd(y0), to: ymd(y0) } })).json; // yesterday only
  assert.deepStrictEqual([y.totals.w.qty, y.totals.r.qty, y.period.days], [5, 3, 1]);
  assert.strictEqual(y.deltas.w, 25); // 5 vs 4 the day before
  assert.strictEqual(y.deltas.r, null); // nothing to compare against — never a made-up percentage
  assert.strictEqual(y.deltas.t, 100); // 8 vs 4
  assert.ok(t.json.deltas && "sales" in t.json.deltas && "margin" in t.json.deltas);
  const three = (await call(API, { ...SUP, query: { from: ymd(new Date(y0.getTime() - 24 * 3600e3)), to: ymd(new Date()) } })).json;
  assert.deepStrictEqual([three.totals.w.qty, three.totals.r.qty, three.period.days], [28, 12, 3]); // today 19+9, yesterday 5+3, before 4
  assert.strictEqual(three.deltas.t, null); // the 3 days before had no sales
  ok("change vs the same-length window before (null when there's nothing to compare); multi-day ranges add up");

  // 10. Trend series: paid units per day, split wholesale / retail.
  const tr = (await call("pages/api/dashboard/trend.js", { ...SUP, query: { bucket: "day" } })).json;
  const last = tr.buckets.length - 1;
  assert.strictEqual(tr.buckets.length, 30);
  // today (sample + cancelled excluded) — the daily trend skips Fridays, so
  // on a Friday today's sales aren't in it at all.
  const isFriday = new Date(Date.now() + 2 * 3600e3).getUTCDay() === 5;
  // Today, yesterday and the day before are the last three buckets — unless
  // one of them is a Friday (no bucket), then the series shifts.
  const want = [[19, 9], [5, 3], [4, 0]];
  const dayOfs = [0, 1, 2].map((k) => new Date(Date.now() + 2 * 3600e3 - k * 864e5).getUTCDay());
  let b = last;
  dayOfs.forEach((dow, k) => {
    if (dow === 5) return; // Friday: not in the daily trend
    assert.deepStrictEqual([tr.buckets[b].w, tr.buckets[b].r], want[k]);
    b -= 1;
  });
  void isFriday;
  const trw = (await call("pages/api/dashboard/trend.js", { ...SUP, query: { bucket: "week" } })).json;
  assert.strictEqual(trw.buckets.length, 12);
  assert.strictEqual(trw.buckets.reduce((a, b) => a + b.w + b.r, 0), 40); // every unit lands in exactly one week
  ok("trend: units per day/week land in the right bucket and add up; same rules as the summary");

  console.log("ALL DASHBOARD SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
