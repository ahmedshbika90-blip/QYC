// Demo data: the generated data set loads into the app's own APIs without
// errors and produces sensible dashboards, accounting and stock views.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, headers: { authorization: t } }, res);
  return { status, json };
};
const { generate } = require("../scripts/demo/generate");

(async () => {
  const d = generate({ months: 3, seed: 7 });
  const again = generate({ months: 3, seed: 7 });
  assert.strictEqual(JSON.stringify(d.orders.slice(0, 5)), JSON.stringify(again.orders.slice(0, 5)));
  for (const [coll, list] of [["products", d.products], ["clients", d.clients], ["orders", d.orders], ["inventoryDocs", d.inventoryDocs], ["invoicePayments", d.invoicePayments], ["paymentRefs", d.paymentRefs], ["logPayments", d.logPayments], ["logState", d.logState], ["dailyStats", d.dailyStats], ["competitorPrices", d.competitorPrices], ["places", d.places], ["clientBalance", d.clientBalance]]) {
    for (const { id, data } of list) await db.collection(coll).doc(id).set(data);
  }
  ok("generator is repeatable (same seed → same data) and loads " + d.orders.length + " invoices");

  // money and stock consistency
  for (const o of d.orders) {
    const sub = o.data.items.reduce((s, l) => s + l.subtotal, 0);
    assert.strictEqual(o.data.subtotal, sub);
    assert.strictEqual(o.data.total, sub - o.data.discount);
    assert.ok(o.data.discount >= 0 && o.data.discount < sub);
  }
  for (const p of d.invoicePayments) {
    const o = d.orders.find((x) => x.id === p.id).data;
    assert.ok(p.data.paidTotal <= o.total, "overpaid " + p.id);
    // invoices only carry amounts and the log they came from
    assert.ok(p.data.payments.every((x) => x.viaLog && x.logId && x.amount > 0 && x.ref === undefined));
  }
  // every log payment: valid reference, split exactly over invoices of its own log
  for (const lp of d.logPayments) {
    assert.ok(/^\\d{1,11}$/.test(lp.data.ref));
    const shares = Object.entries(lp.data.allocations);
    assert.strictEqual(shares.reduce((a, [, v]) => a + v, 0), lp.data.amount);
    assert.ok(lp.data.logIds.every((l) => l.startsWith(lp.data.route + "_")));
    for (const [oid] of shares) {
      const o = d.orders.find((x) => x.id === oid).data;
      const own = o.route + "_" + new Date(o.createdAt).toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
      assert.ok(lp.data.logIds.includes(own) && lp.data.allocLogs[oid] === own); // one of the payment's logs, same agent
    }
  }
  assert.ok(d.orders.every((o) => /^INV-\\d{4}-\\d{6}$/.test(o.data.number)));
  assert.ok(d.competitorPrices.length > 50 && d.competitorPrices.every((c) => c.data.weight > 0 && c.data.deliveryRoute && !c.data.sku));
  assert.ok(d.products.every((p) => Object.values(p.data.stock).every((v) => v >= 0)));
  assert.ok(d.orders.every((o) => o.data.createdAt <= new Date().toISOString()));
  ok("totals add up; payments are on invoice logs, each split exactly over its own log's invoices; invoices carry amounts only; numbers, competitor prices; no negative stock, nothing in the future");

  const from = d.period.from, to = d.period.to;
  const ex = await call("pages/api/executive/overview.js", { role: "executive", uid: "e", query: { from, to } });
  assert.strictEqual(ex.status, 200, JSON.stringify(ex.json));
  assert.ok(ex.json.totals.units > 500 && ex.json.wholesale.units > 0 && ex.json.retail.units > 0);
  assert.ok(ex.json.groups.find((g) => g.id === "alwafi").units > 0 && ex.json.groups.find((g) => g.id === "snacks").units > 0);
  assert.strictEqual(ex.json.totals.uncostedUnits, 0);
  const cu = await call("pages/api/executive/customers.js", { role: "executive", uid: "e", query: { from, to } });
  assert.strictEqual(cu.json.top.length, 10);
  assert.ok(cu.json.top[0].share > cu.json.top[9].share);
  const tr = await call("pages/api/dashboard/trend.js", { role: "manager", uid: "m", query: { bucket: "week" } });
  assert.strictEqual(tr.status, 200);
  const td = await call("pages/api/dashboard/trend.js", { role: "executive", uid: "e", query: { bucket: "day" } });
  assert.strictEqual(td.json.buckets.length, 30);
  const fridays = td.json.buckets.filter((b) => new Date(new Date(b.from).getTime() + 2 * 3600e3).getUTCDay() === 5);
  assert.strictEqual(fridays.length, 0); // daily chart skips Fridays
  const sm = await call("pages/api/dashboard/summary.js", { role: "manager", uid: "m", query: { from, to } });
  assert.strictEqual(sm.status, 200, JSON.stringify(sm.json));
  const rc = await call("pages/api/executive/stock.js", { role: "executive", uid: "e", query: { view: "received", from } });
  assert.ok(rc.json.docs.length >= 10);
  ok("executive overview, customers, receipts, manager summary and trend all work on demo data");

  const acc = await call("pages/api/accounting/logs/index.js", { role: "accountant", uid: "a", query: { from } });
  assert.strictEqual(acc.status, 200, JSON.stringify(acc.json));
  const statuses = new Set(acc.json.logs.map((l) => l.status));
  assert.ok(statuses.has("paid") && statuses.has("unpaid") && statuses.has("partial"), [...statuses].join());
  const someLog = acc.json.logs.find((l) => l.status === "partial");
  const opened = await call("pages/api/accounting/logs/[id].js", { role: "accountant", uid: "a", query: { id: someLog.id } });
  assert.strictEqual(opened.status, 200, JSON.stringify(opened.json));
  assert.ok(opened.json.invoices.length > 0 && opened.json.payments.length > 0);
  // the stored log totals match a fresh recount for every day
  await db.collection("meta").doc("statsState").set({ ready: true });
  const { rebuildDay } = require("../lib/salesStats");
  for (const day of [...new Set(d.logState.map((l) => l.data.day))].slice(-20)) assert.strictEqual((await rebuildDay(day)).diffs.length, 0, day);
  assert.strictEqual((await require("../lib/clientLedger").rebuildClientBalances()).changed, 0); // demo client balances = a full recount
  const cl = await call("pages/api/accounting/clients/index.js", { role: "accountant", uid: "a" });
  assert.ok(cl.json.clients.length > 5 && cl.json.totals.balance > 0);
  const someRef = d.paymentRefs[0].data.ref;
  const fr = await call("pages/api/accounting/find-ref.js", { role: "accountant", uid: "a", query: { ref: someRef.slice(-4) } });
  assert.ok(fr.json.matches.some((m) => m.ref === someRef));
  ok("accountant sees paid / partial / unpaid invoice logs, opens one, and finds a demo payment by its last 4 digits; log totals match a recount");

  // 5. the real seeding script, with the company's OWN products
  for (const name of Object.keys(db._data)) delete db._data[name];
  const mine = [
    { id: "p-real-1", name: "طحنية الوافي 400 جرام", unit: "كرتونة", category: "طحنية", prices: { car1: 61000, car2: 64500 }, avgCost: 52000, stock: { depot: 300, car1: 40, car2: 25, damaged: 0 }, active: true },
    { id: "p-real-2", name: "شبس شيبسيانو كبير", unit: "كرتونة", category: "شبس", prices: { car1: 27000, car2: 29000 }, avgCost: 22000, stock: { depot: 500, car1: 60, car2: 30, damaged: 0 }, active: true },
    { id: "p-real-3", name: "منتج بدون سعر تجزئة", unit: "بكت", category: "طحينة", prices: { car1: 10000 }, avgCost: 8000, stock: { depot: 10 }, active: true },
    { id: "demo-old-sample", name: "منتج تجريبي قديم", unit: "كرتونة", category: "شبس", prices: { car1: 1, car2: 1 }, demo: true, active: true },
  ];
  for (const p of mine) { const { id, ...data } = p; await db.collection("products").doc(id).set(data); }
  await db.collection("orders").doc("old-real-invoice").set({ route: "car1", clientId: "1", total: 5, items: [], createdAt: "2025-01-01T00:00:00Z" });
  const fb = require.cache[fbPath].exports;
  fb.adminAuth.listUsers = async () => ({ users: [{ uid: "u-c2", email: "a@x", customClaims: { role: "agent_car2" } }] });
  fb.adminDb.recursiveDelete = async (coll) => { delete db._data[coll._name || coll.id]; };
  fb.adminDb.bulkWriter = () => { const ops = []; return { set: (r, v, o) => ops.push(() => r.set(v, o)), update: (r, v) => ops.push(() => r.update(v)), async close() { for (const o of ops) await o(); } }; };
  process.env.FIREBASE_PROJECT_ID = "demo-proj";
  const log = console.log; const lines = []; console.log = (...a) => lines.push(a.join(" "));
  const { main } = require("../scripts/demo/seed.js");
  await main(["--months=2"]); // dry run
  const afterDry = Object.keys(db._data.orders || {});
  await main(["--run", "--confirm=demo-proj", "--months=2"]);
  console.log = log;
  assert.deepStrictEqual(afterDry, ["old-real-invoice"]); // dry run changed nothing
  assert.ok(!db._data.orders["old-real-invoice"]); // old invoices wiped
  const prods = db._data.products;
  assert.ok(!prods["demo-old-sample"]); // earlier sample product removed
  assert.deepStrictEqual(prods["p-real-1"].prices, { car1: 61000, car2: 64500 }); // untouched
  assert.deepStrictEqual(prods["p-real-1"].stock, { depot: 300, car1: 40, car2: 25, damaged: 0 }); // untouched without --reset-stock
  const lines2 = Object.values(db._data.orders).flatMap((o) => o.items);
  assert.ok(lines2.length > 100);
  assert.ok(lines2.every((l) => ["p-real-1", "p-real-2"].includes(l.productId))); // only real, fully priced products
  const l1 = lines2.find((l) => l.productId === "p-real-1" && !l.freeSample);
  assert.ok([61000, 64500].includes(l1.price) && l1.unitCost === 52000);
  assert.ok(lines.some((t) => t.includes("منتج بدون سعر تجزئة"))); // reported as skipped
  assert.ok(d.logPayments.some((p) => p.data.logIds.length > 1)); // some transfers cover two days
  for (const coll of ["logPayments", "logState", "competitorPrices", "places", "dailyStats", "clientBalance"]) assert.ok(Object.keys(db._data[coll] || {}).length > 0, coll + " written");
  assert.ok(db._data.meta.invoiceNumbering.enabled);
  console.log = () => {};
  await main(["--run", "--confirm=demo-proj", "--months=2", "--reset-stock"]);
  console.log = log;
  assert.notDeepStrictEqual(db._data.products["p-real-1"].stock, { depot: 300, car1: 40, car2: 25, damaged: 0 });
  assert.deepStrictEqual(db._data.products["p-real-1"].prices, { car1: 61000, car2: 64500 });
  ok("seeding uses the company's own products, prices and costs; leaves them (and stock) untouched; dry run changes nothing");

  // ---------- staging test data: trend, volume, period, clear, safety ----------
  const G = require("../scripts/demo/generate");
  const salesHalves = (o) => {
    const d = G.generate({ months: 4, seed: 7, catalog: undefined, ...o });
    const xs = d.orders.map((x) => x.data.createdAt).sort();
    const mid = new Date((Date.parse(xs[0]) + Date.parse(xs[xs.length - 1])) / 2).toISOString();
    const sum = (f) => d.orders.filter((x) => f(x.data.createdAt)).reduce((a, x) => a + x.data.total, 0);
    return { n: d.orders.length, ratio: sum((x) => x >= mid) / sum((x) => x < mid), from: d.period.from };
  };
  const gr = salesHalves({ trend: "growing" }), de = salesHalves({ trend: "declining" }), sp = salesHalves({ trend: "spike" });
  assert.ok(gr.ratio > 1.15 && de.ratio < 0.8 && sp.ratio > gr.ratio, JSON.stringify({ gr, de, sp }));
  assert.ok(salesHalves({ volume: "high" }).n > 1.6 * salesHalves({ volume: "normal" }).n && salesHalves({ volume: "low" }).n < 0.7 * salesHalves({}).n);
  assert.ok(G.generate({ months: 8, seed: 7 }).period.from < G.generate({ months: 2, seed: 7 }).period.from);
  // clear keeps products and accounts, removes business data (and, with --zero-stock, every balance)
  await db.collection("meta").doc("invoiceCounter_2026").set({ value: 900 });
  await main(["--run", "--confirm=demo-proj", "--clear", "--zero-stock"]);
  assert.ok(!db._data.meta.invoiceCounter_2026); // numbering restarts at 1
  assert.ok(Object.values(db._data.products).every((p) => Object.values(p.stock || {}).every((v) => v === 0)));
  assert.ok(Object.keys(db._data.orders || {}).length === 0 && Object.keys(db._data.clients || {}).length === 0);
  assert.ok(Object.keys(db._data.products).length > 0);
  // never on a project that doesn't look like a test one
  process.env.FIREBASE_PROJECT_ID = "mahgoub-prod";
  const exit = process.exit; let refused = false;
  process.exit = () => { refused = true; throw new Error("exit"); };
  await main(["--run", "--confirm=mahgoub-prod", "--clear"]).catch(() => {});
  process.exit = exit;
  assert.ok(refused);
  ok("staging data: chosen trend (growing / declining / spike…), volume and period shape the history; clear wipes business data only; a non-test project is refused");

  console.log("ALL DEMO-DATA SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
