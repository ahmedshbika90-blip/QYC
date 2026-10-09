// Accounting by invoice log: a van's invoices of one day form a log; the
// accountant records the money against the log, distributes it to the
// clients' invoices, and reads agents' positions and reports.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, url: "/" + rel, headers: { authorization: t } }, res);
  return { status, json };
};
const { businessDay } = require("../lib/businessDay");
const { rebuildDay } = require("../lib/salesStats");
const W = { role: "agent_car1", uid: "abd", salesSupervisor: true };
const R = { role: "agent_car2", uid: "yun", salesSupervisor: false };
const AC = { role: "accountant", uid: "acc", email: "acc@x" };
const today = businessDay(new Date());
const LOG = "car1_" + today;
const LA = "pages/api/accounting/logs/[id].js";
const state = async () => (await db.collection("logState").doc(LOG).get()).data();
const rid = (n) => "req-log-0000000" + String(n).padStart(3, "0");

(async () => {
  await db.collection("meta").doc("statsState").set({ ready: true });
  await db.collection("products").doc("p1").set({ name: "طحنية", active: true, prices: { car1: 1000, car2: 1200 }, stock: { depot: 0, car1: 500, car2: 500 }, avgCost: 600 });
  for (const [id, route] of [["1000", "car1"], ["1001", "car1"], ["1002", "car2"]]) await db.collection("clients").doc(id).set({ name: "عميل " + id, route, active: true });
  const inv = async (who, client, qty, n) => {
    const r = await call("pages/api/orders/create-staff.js", { ...who, method: "POST", body: { clientId: client, items: [{ productId: "p1", qty }], requestId: rid(n) } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    return r.json.orderId;
  };
  const o1 = await inv(W, "1000", 3, 1); // 3,000
  const o2 = await inv(W, "1001", 5, 2); // 5,000
  const o3 = await inv(W, "1000", 2, 3); // 2,000
  await inv(R, "1002", 1, 4);            // other van
  assert.deepStrictEqual(await state(), { route: "car1", day: today, inv: 3, totalC: 1000000, updatedAt: (await state()).updatedAt });
  ok("each invoice adds itself to its van's log for the day, in the same transaction");

  // accountant sees the log
  const L1 = await call("pages/api/accounting/logs/index.js", AC);
  assert.strictEqual(L1.status, 200, JSON.stringify(L1.json));
  const lg = L1.json.logs.find((l) => l.id === LOG);
  assert.deepStrictEqual([lg.invoices, lg.total, lg.paid, lg.remaining, lg.status], [3, 10000, 0, 10000, "unpaid"]);
  assert.strictEqual(L1.json.logs.length, 2);
  assert.strictEqual((await call("pages/api/accounting/logs/index.js", W)).status, 403);
  const d1 = await call(LA, { ...AC, query: { id: LOG } });
  assert.deepStrictEqual(d1.json.invoices.map((i) => [i.id, i.clientName, i.total, i.remaining]), [[o1, "عميل 1000", 3000, 3000], [o2, "عميل 1001", 5000, 5000], [o3, "عميل 1000", 2000, 2000]]);
  ok("the accountant lists logs (van, day, invoices, total, paid, remaining) and opens one with its invoices");

  // 1. the agent's transfer, recorded on the log WITH what each invoice got
  const pay = (n, allocations, extra = {}) => call(LA, { ...AC, method: "POST", query: { id: LOG }, body: { action: "pay", ref: "88001234", bank: "bok", amount: "7000", date: today, requestId: rid(n), allocations, ...extra } });
  assert.strictEqual((await pay(10, {})).status, 400);                              // nothing split → not saved
  const short = await pay(10, { [o1]: "3000", [o2]: "3000" });                       // 6,000 of 7,000
  assert.strictEqual(short.status, 400); assert.ok(/باقٍ 1000/.test(short.json.error));
  assert.strictEqual((await pay(10, { [o1]: "3000", [o2]: "5000" })).status, 400);   // 8,000 > 7,000
  assert.strictEqual((await pay(10, { [o1]: "3500", [o2]: "3500" })).status, 400);   // more than invoice o1 owes
  assert.ok(!db._data.logPayments?.[rid(10)] && !db._data.paymentRefs?.["bok__88001234"]);      // nothing half-saved
  const p1 = await pay(10, { [o1]: "3000", [o2]: "4000", [o3]: "" });
  assert.strictEqual(p1.status, 201, JSON.stringify(p1.json));
  assert.deepStrictEqual([p1.json.log.received, p1.json.log.toDistribute, p1.json.log.paid, p1.json.log.remaining, p1.json.log.status], [7000, 0, 7000, 3000, "partial"]);
  assert.deepStrictEqual(p1.json.invoices.map((i) => [i.paid, i.status]), [[3000, "paid"], [4000, "partial"], [0, "unpaid"]]);
  assert.strictEqual((await pay(10, { [o1]: "3000", [o2]: "4000" })).json.duplicate, true); // resend
  assert.strictEqual((await pay(11, { [o1]: "3000", [o2]: "4000" })).status, 409);          // same bank + reference
  const near = await pay(12, { [o3]: "100" }, { ref: "55501234", bank: "faisal", amount: "100" });
  assert.ok(near.status === 409 && near.json.needsConfirm && near.json.similar[0].kind === "log");
  // the invoice only records the amount it received, and from which log
  const pid = rid(10);
  const ip2 = (await db.collection("invoicePayments").doc(o2).get()).data();
  assert.deepStrictEqual(Object.keys(ip2.payments[0]).sort(), ["amount", "createdAt", "createdBy", "date", "id", "logId", "viaLog"]);
  assert.deepStrictEqual([ip2.paidTotal, ip2.payments[0].viaLog, ip2.payments[0].logId], [4000, pid, LOG]);
  ok("a payment is saved on the log only together with a split that uses all of it; invoices get only amounts; same reference refused; same last 4 asks first");

  // 2. changing the split: again only one that uses the whole payment
  const alloc = (allocations) => call(LA, { ...AC, method: "POST", query: { id: LOG }, body: { action: "allocate", paymentId: pid, allocations } });
  assert.strictEqual((await alloc({ [o1]: "3000", [o2]: "2000" })).status, 400); // 5,000 of 7,000
  assert.strictEqual((await call("pages/api/payments/[orderId].js", { ...AC, method: "POST", query: { orderId: o2 }, body: { action: "void", paymentId: ip2.payments[0].id, reason: "x" } })).status, 409);
  const a2 = await alloc({ [o1]: "3000", [o2]: "2000", [o3]: "2000" });
  assert.strictEqual(a2.status, 200, JSON.stringify(a2.json));
  assert.deepStrictEqual(a2.json.invoices.map((i) => i.paid), [3000, 2000, 2000]);
  assert.strictEqual(a2.json.log.paid, 7000);
  ok("the split can be changed, never leaving part of the payment unassigned; shares can't be touched from the invoice");

  // the invoice page can't take a payment any more; an older direct payment still counts on the log
  assert.strictEqual((await call("pages/api/payments/[orderId].js", { ...AC, method: "POST", query: { orderId: o2 }, body: { ref: "4455", bank: "nile", amount: 1000, date: today, requestId: rid(20) } })).status, 409);
  const direct = await directPay(AC, o2, { ref: "4455", bank: "nile", amount: 3000, date: today, requestId: rid(20) });
  assert.strictEqual(direct.status, 201, JSON.stringify(direct.json));
  let s = await state();
  assert.deepStrictEqual([s.paidC, s.receivedC, s.allocatedC], [1000000, 700000, 700000]);
  const fr = await call("pages/api/accounting/find-ref.js", { ...AC, query: { ref: "1234" } });
  assert.ok(fr.json.matches.some((m) => m.kind === "log" && m.logId === LOG));
  ok("payments can no longer be added on an invoice; older direct ones still count on the log; reference search finds log payments");

  // agents and report
  const ag = await call("pages/api/accounting/agents.js", AC);
  assert.strictEqual(ag.status, 200, JSON.stringify(ag.json));
  const car1 = ag.json.agents.find((a) => a.route === "car1");
  assert.deepStrictEqual([car1.allTime.total, car1.allTime.paid, car1.allTime.remaining, car1.openLogs], [10000, 10000, 0, 0]);
  const car2 = ag.json.agents.find((a) => a.route === "car2");
  assert.deepStrictEqual([car2.allTime.remaining, car2.openLogs, car2.oldestOpen], [1200, 1, today]);
  assert.strictEqual(ag.json.combined.allTime.remaining, 1200);
  // operating margin (sale − cost: 10 units × (1,000 − 600)) shown with what he owes
  assert.deepStrictEqual([car1.period.margin, car1.period.marginPct], [4000, 40]);
  assert.strictEqual(ag.json.combined.period.margin, 4000 + 600);
  const lgm = await call(LA, { ...AC, query: { id: LOG } });
  assert.deepStrictEqual([lgm.json.log.margin, lgm.json.log.marginPct], [4000, 40]);
  const rp = await call("pages/api/accounting/report.js", { ...AC, query: { route: "car1" } });
  assert.deepStrictEqual([rp.json.logs.length, rp.json.totals.paid, rp.json.payments.length, rp.json.payments[0].ref, rp.json.logs[0].margin, rp.json.totals.margin], [1, 10000, 1, "88001234", 4000, 4000]);
  const rpAll = await call("pages/api/accounting/report.js", { ...AC, query: { route: "all" } });
  assert.deepStrictEqual([rpAll.json.logs.length, rpAll.json.totals.remaining], [2, 1200]);
  ok("agents: each van's position (all time + period) and both together, with operating margin; reports per agent or all");

  // cancellation and voiding keep everything consistent
  const cx = await call("pages/api/orders/[id]/status.js", { ...W, method: "PATCH", query: { id: o3 }, body: { status: "cancelled" } });
  assert.strictEqual(cx.status, 200, JSON.stringify(cx.json));
  s = await state();
  assert.deepStrictEqual([s.inv, s.totalC, s.paidC], [2, 800000, 1000000]); // 2,000 already paid on it → credit
  assert.strictEqual((await rebuildDay(today)).diffs.length, 0);
  const v = await call(LA, { ...AC, method: "POST", query: { id: LOG }, body: { action: "void", paymentId: pid, reason: "تحويل مكرر" } });
  assert.strictEqual(v.status, 200, JSON.stringify(v.json));
  assert.deepStrictEqual([v.json.log.received, v.json.log.paid, v.json.log.remaining], [0, 3000, 5000]);
  assert.ok(v.json.invoices.find((i) => i.id === o1).paid === 0);
  assert.ok(!db._data.paymentRefs["bok__88001234"]);
  assert.strictEqual((await rebuildDay(today)).diffs.length, 0);
  // the nightly check repairs a damaged log
  await db.collection("logState").doc(LOG).update({ paidC: 1 });
  assert.ok((await rebuildDay(today)).diffs.some((d) => d.field === "logState." + LOG));
  await rebuildDay(today, { write: true });
  assert.strictEqual((await state()).paidC, 300000);
  ok("cancelling an invoice and voiding a log payment keep the log exact; the nightly check repairs a damaged log");

  console.log("ALL INVOICE-LOG ACCOUNTING SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
