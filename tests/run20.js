// One payment over several logs; client balances, statements and ageing;
// collections by transfer date.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, ...claims } = {}) {
  const h = load(rel); let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, url: "/" + rel, headers: { authorization: t } }, res); return { status, json };
};
const { businessDay } = require("../lib/businessDay");
const { rebuildDay } = require("../lib/salesStats");
const { rebuildClientBalances } = require("../lib/clientLedger");
const W = { role: "agent_car1", uid: "abd", salesSupervisor: true };
const AC = { role: "accountant", uid: "acc" };
const LA = "pages/api/accounting/logs/[id].js";
const DAY = 864e5;
const today = businessDay(new Date());
const yday = businessDay(new Date(Date.now() - DAY));
const rid = (n) => "req-p20-00000" + String(n).padStart(4, "0");

(async () => {
  await db.collection("meta").doc("statsState").set({ ready: true });
  await db.collection("products").doc("p1").set({ name: "طحنية", active: true, prices: { car1: 1000, car2: 1000 }, stock: { depot: 0, car1: 500, car2: 0 }, avgCost: 600 });
  for (const id of ["1000", "1001"]) await db.collection("clients").doc(id).set({ name: "عميل " + id, storeName: "متجر " + id, route: "car1", active: true, phone: "0912345678" });
  const inv = async (client, qty, n) => {
    const r = await call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: client, items: [{ productId: "p1", qty }], requestId: rid(n) } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    return r.json.orderId;
  };
  // yesterday's invoices: move them back one day (same van)
  const y1 = await inv("1000", 4, 1); // 4,000
  const y2 = await inv("1001", 2, 2); // 2,000
  for (const id of [y1, y2]) {
    const o = (await db.collection("orders").doc(id).get()).data();
    const back = new Date(Date.parse(o.createdAt) - DAY).toISOString();
    await db.collection("orders").doc(id).update({ createdAt: back });
    const b = (await db.collection("clientBalance").doc(o.clientId).get()).data();
    b.inv[id].at = back;
    await db.collection("clientBalance").doc(o.clientId).set(b);
  }
  await rebuildDay(yday, { write: true }); await rebuildDay(today, { write: true });
  const t1 = await inv("1000", 3, 3); // today 3,000
  const LOGY = "car1_" + yday, LOGT = "car1_" + today;

  // ---------- 1. one transfer for both days ----------
  const pay = (body) => call(LA, { ...AC, method: "POST", query: { id: LOGT }, body: { action: "pay", ref: "770011223", bank: "bok", date: today, requestId: rid(10), ...body } });
  assert.strictEqual((await pay({ amount: "9000", allocations: { [t1]: "3000", [y1]: "4000", [y2]: "2000" } })).status, 400); // yesterday's invoices without adding that log
  assert.strictEqual((await pay({ amount: "9000", logIds: ["car2_" + yday], allocations: { [t1]: "3000" } })).status, 400); // another agent's log
  const p = await pay({ amount: "8000", logIds: [LOGY], allocations: { [t1]: "3000", [y1]: "4000", [y2]: "1000" } });
  assert.strictEqual(p.status, 201, JSON.stringify(p.json));
  assert.deepStrictEqual(p.json.payment.logIds, [LOGT, LOGY]);
  const st = async (id) => (await db.collection("logState").doc(id).get()).data();
  assert.deepStrictEqual([(await st(LOGT)).receivedC, (await st(LOGT)).paidC], [300000, 300000]);
  assert.deepStrictEqual([(await st(LOGY)).receivedC, (await st(LOGY)).paidC], [500000, 500000]);
  const ly = await call(LA, { ...AC, query: { id: LOGY } });
  assert.ok(ly.json.payments.some((x) => x.id === rid(10))); // shows on both logs
  assert.deepStrictEqual([ly.json.log.paid, ly.json.log.remaining], [5000, 1000]);
  for (const d of [today, yday]) assert.strictEqual((await rebuildDay(d)).diffs.length, 0, d);
  // re-split across days, then void: every log stays exact
  const re = await call(LA, { ...AC, method: "POST", query: { id: LOGT }, body: { action: "allocate", paymentId: rid(10), allocations: { [t1]: "2000", [y1]: "4000", [y2]: "2000" } } });
  assert.strictEqual(re.status, 200, JSON.stringify(re.json));
  assert.deepStrictEqual([(await st(LOGT)).receivedC, (await st(LOGY)).receivedC], [200000, 600000]);
  for (const d of [today, yday]) assert.strictEqual((await rebuildDay(d)).diffs.length, 0, d);
  ok("one transfer can cover several days of the same agent: split over both logs, each log counts its part; re-split and recount stay exact");

  // ---------- 2. client balances, ageing, statement ----------
  const cl = await call("pages/api/accounting/clients/index.js", AC);
  assert.strictEqual(cl.status, 200, JSON.stringify(cl.json));
  const c1000 = cl.json.clients.find((c) => c.id === "1000");
  assert.deepStrictEqual([c1000.balance, c1000.openInvoices, c1000.name, c1000.oldestDays], [1000, 1, "عميل 1000", 0]); // 7,000 − 6,000 paid
  assert.ok(!cl.json.clients.find((c) => c.id === "1001")); // fully paid → not listed by default
  assert.ok((await call("pages/api/accounting/clients/index.js", { ...AC, query: { all: "1" } })).json.clients.find((c) => c.id === "1001"));
  assert.strictEqual(cl.json.totals.balance, 1000);
  assert.strictEqual(cl.json.totals.ageing["0-30"], 1000);
  // an old unpaid invoice falls into 61-90
  const old = await inv("1001", 5, 4);
  const back = new Date(Date.now() - 70 * DAY).toISOString();
  await db.collection("orders").doc(old).update({ createdAt: back });
  const b1001 = (await db.collection("clientBalance").doc("1001").get()).data(); b1001.inv[old].at = back; await db.collection("clientBalance").doc("1001").set(b1001);
  await rebuildDay(today, { write: true }); await rebuildDay(businessDay(new Date(back)), { write: true }); // the test moved it by hand
  const cl2 = await call("pages/api/accounting/clients/index.js", AC);
  assert.deepStrictEqual(cl2.json.clients.find((c) => c.id === "1001").ageing, { "0-30": 0, "31-60": 0, "61-90": 5000, "90+": 0 });
  const stmt = await call("pages/api/accounting/clients/[id].js", { ...AC, query: { id: "1000" } });
  assert.strictEqual(stmt.status, 200, JSON.stringify(stmt.json));
  assert.deepStrictEqual([stmt.json.invoiced, stmt.json.paid, stmt.json.lines[stmt.json.lines.length - 1].balance], [7000, 6000, 1000]);
  assert.deepStrictEqual(stmt.json.lines.map((l) => l.kind).sort(), ["invoice", "invoice", "payment", "payment"]);
  assert.strictEqual(stmt.json.lines[0].kind, "invoice"); // oldest first
  // cancelling and voiding move balances
  await call("pages/api/orders/[id]/status.js", { ...W, method: "PATCH", query: { id: t1 }, body: { status: "cancelled" } });
  const after = (await call("pages/api/accounting/clients/index.js", { ...AC, query: { all: "1" } })).json.clients.find((c) => c.id === "1000");
  assert.deepStrictEqual([after.balance, after.credit], [0, 2000]); // paid 2,000 on a cancelled invoice → credit
  const vd = await call(LA, { ...AC, method: "POST", query: { id: LOGT }, body: { action: "void", paymentId: rid(10), reason: "خطأ" } });
  assert.strictEqual(vd.status, 200, JSON.stringify(vd.json));
  for (const d of [today, yday]) assert.strictEqual((await rebuildDay(d)).diffs.length, 0, d);
  assert.deepStrictEqual(await rebuildClientBalances(), { clients: 2, changed: 0 }); // running balances = a full recount
  ok("client balances follow invoices, payments, cancellations and voids; ageing by invoice age; statement with running balance; a full recount agrees");

  // ---------- 3. collections by transfer date ----------
  const p2 = await call(LA, { ...AC, method: "POST", query: { id: LOGY }, body: { action: "pay", ref: "5512", bank: "nile", date: yday, amount: "4000", allocations: { [y1]: "4000" }, requestId: rid(20) } });
  assert.strictEqual(p2.status, 201, JSON.stringify(p2.json));
  const col = await call("pages/api/accounting/collections.js", { ...AC, query: { from: yday, to: today } });
  assert.strictEqual(col.status, 200, JSON.stringify(col.json));
  assert.deepStrictEqual([col.json.total, col.json.count, col.json.byDay.map((x) => x.date)], [4000, 1, [yday]]); // the voided one is out
  assert.deepStrictEqual(col.json.byBank.map((b) => [b.bank, b.amount]), [["nile", 4000]]);
  assert.strictEqual((await call("pages/api/accounting/collections.js", { ...AC, query: { from: today, to: today } })).json.total, 0);
  assert.strictEqual((await call("pages/api/accounting/collections.js", { ...AC, query: { from: today, to: yday } })).status, 400);
  assert.strictEqual((await call("pages/api/accounting/collections.js", { ...W, query: { from: yday, to: today } })).status, 403);
  ok("collections: money received by transfer date, per day / bank / agent; voided payments excluded");

  console.log("ALL STATEMENT/COLLECTIONS SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
