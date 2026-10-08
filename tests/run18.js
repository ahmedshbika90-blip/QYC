// Phase 4: legal invoice numbers (INV-YYYY-000001, gap-free per year) and
// the nightly stock check (balance = starting point + ledger movements).
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, headers = {}, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, url: "/" + rel, headers: { authorization: t, ...headers } }, res);
  return { status, json };
};
const W = { role: "agent_car1", uid: "abd" };
const M = { role: "manager", uid: "mgr" };
const N = require("../lib/invoiceNumbers");
const SC = require("../lib/stockCheck");
const rid = (n) => "req-p4-000000" + String(n).padStart(4, "0");

(async () => {
  await db.collection("products").doc("p1").set({ name: "طحنية", active: true, prices: { car1: 1000, car2: 1100 }, stock: { depot: 100, car1: 20, car2: 0 }, avgCost: 600 });
  await db.collection("clients").doc("1000").set({ name: "عميل", route: "car1", active: true });
  const inv = (n, qty = 1) => call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: "1000", items: [{ productId: "p1", qty }], requestId: rid(n) } });

  // ---------- invoice numbers ----------
  const before = await inv(1);
  assert.strictEqual(before.status, 201); assert.strictEqual(before.json.number, null); // not switched on yet
  // older invoices (two years) waiting for numbers
  await db.collection("orders").doc("old-a").set({ route: "car1", clientId: "1000", status: "active", createdAt: "2025-12-31T21:30:00.000Z", total: 1, items: [] }); // 2025-12-31 23:30 Khartoum
  await db.collection("orders").doc("old-b").set({ route: "car1", clientId: "1000", status: "cancelled", createdAt: "2025-12-31T22:30:00.000Z", total: 1, items: [] }); // 2026-01-01 00:30 Khartoum
  await db.collection("orders").doc("old-c").set({ route: "car1", clientId: "1000", status: "active", createdAt: "2025-06-01T10:00:00.000Z", total: 1, items: [] });
  const dry = await N.numberExisting();
  assert.ok(dry.dryRun && dry.numbered === 4 && !db._data.meta?.invoiceNumbering);
  const done = await N.numberExisting({ write: true });
  assert.strictEqual(done.numbered, 4);
  const num = async (id) => (await db.collection("orders").doc(id).get()).data().number;
  assert.deepStrictEqual([await num("old-c"), await num("old-a"), await num("old-b"), await num(rid(1))], ["INV-2025-000001", "INV-2025-000002", "INV-2026-000001", "INV-2026-000002"]);
  assert.ok(db._data.meta.invoiceNumbering.enabled);
  // new invoices continue the sequence; a resend or a refused invoice uses no number
  const a = await inv(2);
  assert.strictEqual(a.json.number, "INV-2026-000003");
  assert.ok((await inv(2)).json.duplicate);
  assert.strictEqual((await inv(3, 999)).status, 400); // not enough stock
  assert.strictEqual((await inv(4)).json.number, "INV-2026-000004");
  // cancelling keeps the number (no holes)
  await call("pages/api/orders/[id]/status.js", { ...W, method: "PATCH", query: { id: rid(4) }, body: { status: "cancelled" } });
  assert.strictEqual(await num(rid(4)), "INV-2026-000004");
  assert.deepStrictEqual(await N.numberExisting({ write: true }), { alreadyEnabled: true, numbered: 0, byYear: {} });
  ok("invoice numbers: older invoices numbered oldest-first per Khartoum year, then each new invoice gets the next one; resends and refused invoices use none; cancelled keep theirs");

  // ---------- stock check ----------
  const first = await SC.runStockCheck();
  assert.ok(first.baseline && first.ok);
  // real movements: sales, cancellation, depot correction, new product with opening stock
  await inv(5, 2);
  await call("pages/api/orders/[id]/status.js", { ...W, method: "PATCH", query: { id: rid(5) }, body: { status: "cancelled" } });
  await inv(6, 3);
  const up = await call("pages/api/products/[id]/update.js", { ...M, method: "PATCH", query: { id: "p1" }, body: { depotStock: 90 } });
  assert.strictEqual(up.status, 200, JSON.stringify(up.json));
  const np = await call("pages/api/products/create.js", { ...M, method: "POST", body: { name: "شيبس", unit: "كرتونة", category: "شبس", priceCar1: 500, priceCar2: 600, avgCost: 300, openingStock: 40, requestId: "req-p4-product-0001" } });
  assert.ok(np.status === 201 || np.status === 200, JSON.stringify(np.json));
  await new Promise((r) => setTimeout(r, 5));
  const second = await SC.runStockCheck();
  assert.ok(second.ok, JSON.stringify(second.diffs));
  assert.ok(second.movements >= 4);
  // a balance changed outside any movement is reported, not corrected
  await db.collection("products").doc("p1").update({ "stock.car1": 50 });
  await new Promise((r) => setTimeout(r, 5));
  const third = await SC.runStockCheck();
  assert.deepStrictEqual(third.diffs.map((d) => [d.productId, d.field, d.expected, d.actual, d.difference]), [["p1", "car1", 15, 50, 35]]);
  assert.strictEqual((await db.collection("products").doc("p1").get()).data().stock.car1, 50);
  // the manager sees it as a notification and on the stock-check page
  const n = await call("pages/api/notifications.js", M);
  assert.ok(n.json.items.some((i) => i.href === "/stock-check"));
  assert.strictEqual((await call("pages/api/stock-check.js", W)).status, 403);
  const g = await call("pages/api/stock-check.js", M);
  assert.strictEqual(g.json.check.diffs.length, 1);
  // still reported the next night until the manager accepts the balance after counting
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual((await SC.runStockCheck()).diffs.length, 1);
  const acc = await call("pages/api/stock-check.js", { ...M, method: "POST", body: { action: "accept", productId: "p1", field: "car1" } });
  assert.ok(acc.json.check.ok, JSON.stringify(acc.json));
  await inv(7, 1); // movements after accepting are still checked
  await new Promise((r) => setTimeout(r, 5));
  assert.ok((await SC.runStockCheck()).ok);
  // nightly job runs both checks
  process.env.CRON_SECRET = "cron-test";
  const night = await call("pages/api/cron/nightly.js", { headers: { authorization: "Bearer cron-test" } });
  assert.strictEqual(night.status, 200, JSON.stringify(night.json));
  assert.ok(night.json.stock.ok && night.json.stats.day);
  assert.strictEqual((await call("pages/api/cron/nightly.js", { headers: { authorization: "Bearer no" } })).status, 401);
  ok("stock check: sales, cancellations, corrections and opening balances all match their ledger; an unexplained change is reported (notification + page) and kept until the manager accepts it; the nightly job runs it");

  console.log("ALL PHASE-4 NUMBERS/STOCK SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
