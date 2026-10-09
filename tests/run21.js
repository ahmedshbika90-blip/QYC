// Refunds (مرتجع) and money returns (رد مبلغ).
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
const W2 = { role: "agent_car2", uid: "yun" };
const M = { role: "manager", uid: "mgr" };
const AC = { role: "accountant", uid: "acc" };
const today = businessDay(new Date());
const LOG = "car1_" + today;
const rid = (n) => "req-p21-00000" + String(n).padStart(4, "0");
const order = async (id) => (await db.collection("orders").doc(id).get()).data();
const stock = async (id = "p1") => (await db.collection("products").doc(id).get()).data().stock;
const R = "pages/api/orders/[id]/refund.js";

(async () => {
  await db.collection("meta").doc("statsState").set({ ready: true });
  await db.collection("products").doc("p1").set({ name: "طحنية", active: true, prices: { car1: 1000, car2: 1000 }, stock: { depot: 0, car1: 100, car2: 0, damaged: 0 }, avgCost: 600 });
  await db.collection("products").doc("p2").set({ name: "شيبس", active: true, prices: { car1: 500, car2: 500 }, stock: { depot: 0, car1: 100, car2: 0, damaged: 0 }, avgCost: 300 });
  for (const id of ["1000", "1001", "1002"]) await db.collection("clients").doc(id).set({ name: "عميل " + id, route: "car1", active: true });
  const inv = async (client, items, n, discount = 0) => {
    const r = await call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: client, items, discount, requestId: rid(n) } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    return r.json.orderId;
  };
  const pay = (n, allocations, amount) => call("pages/api/accounting/logs/[id].js", { ...AC, method: "POST", query: { id: LOG }, body: { action: "pay", ref: "90" + n + "0" + n, bank: "bok", amount: String(amount), date: today, requestId: rid(n), allocations } });

  // ---------- 1. partial refund, unpaid invoice ----------
  const a = await inv("1000", [{ productId: "p1", qty: 10 }, { productId: "p2", qty: 4 }], 1, 1200); // 12,000 − 1,200 = 10,800
  const pv = await call(R, { ...W, method: "POST", query: { id: a }, body: { preview: true, lines: [{ index: 0, qty: 3 }] } });
  assert.deepStrictEqual([pv.json.value, pv.json.full], [2700, false]); // 3,000 at the invoice's 10% discount
  const s0 = await stock(); const s0b = await stock("p2");
  const r1 = await call(R, { ...W, method: "POST", query: { id: a }, body: { requestId: rid(2), lines: [{ index: 0, qty: 2 }, { index: 1, qty: 1, damaged: true }] } });
  assert.strictEqual(r1.status, 200, JSON.stringify(r1.json));
  const o1 = await order(a);
  assert.deepStrictEqual(o1.items.map((i) => i.qty), [8, 3]);
  assert.deepStrictEqual([o1.subtotal, o1.status, o1.refundStatus, o1.refunds.length, o1.refunds[0].lines.map((l) => [l.qty, l.damaged])], [9500, "active", "partial", 1, [[2, false], [1, true]]]);
  assert.strictEqual(o1.total + o1.refunds[0].value, 10800); // nothing lost: new total + refund = old total
  const s1 = await stock(); const s1b = await stock("p2");
  assert.deepStrictEqual([s1.car1, s1b.car1, s1b.damaged_car1 || 0], [s0.car1 + 2, s0b.car1, (s0b.damaged_car1 || 0) + 1]); // damaged stays in the van, apart // sellable back to the van, damaged to damaged
  assert.strictEqual((await call(R, { ...W, method: "POST", query: { id: a }, body: { requestId: rid(2), lines: [{ index: 0, qty: 2 }] } })).json.duplicate, true);
  assert.strictEqual((await call(R, { ...W, method: "POST", query: { id: a }, body: { requestId: rid(3), lines: [{ index: 0, qty: 9 }] } })).status, 400); // more than on the invoice
  assert.strictEqual((await call(R, { ...W2, method: "POST", query: { id: a }, body: { requestId: rid(4), lines: [{ index: 0, qty: 1 }] } })).status, 403);
  assert.strictEqual((await rebuildDay(today)).diffs.length, 0);
  ok("partial refund by lines: value from sale prices with the discount scaled; sellable back to the van, damaged kept apart in the van; a note on the invoice; daily figures exact");

  // ---------- 2. after 9 hours: request → manager ----------
  const b = await inv("1001", [{ productId: "p1", qty: 5 }], 5);
  await db.collection("orders").doc(b).update({ createdAt: new Date(Date.now() - 10 * 3600e3).toISOString() });
  await rebuildDay(today, { write: true });
  assert.strictEqual((await call(R, { ...W, method: "POST", query: { id: b }, body: { requestId: rid(6), lines: [{ index: 0, qty: 1 }] } })).status, 400); // reason needed
  const rq = await call(R, { ...W, method: "POST", query: { id: b }, body: { requestId: rid(6), reason: "العميل أعاد كرتونة", lines: [{ index: 0, qty: 1 }] } });
  assert.strictEqual(rq.status, 201, JSON.stringify(rq.json)); assert.ok(rq.json.requested);
  assert.strictEqual((await order(b)).items[0].qty, 5); // nothing changes until approved
  const n = await call("pages/api/notifications.js", M);
  assert.ok(n.json.items.some((i) => i.requestType === "طلب مرتجع"));
  const dec = await call("pages/api/requests/[id]/decide.js", { ...M, method: "PATCH", query: { id: rid(6) }, body: { action: "approve" } });
  assert.strictEqual(dec.status, 200, JSON.stringify(dec.json));
  assert.deepStrictEqual([(await order(b)).items[0].qty, (await order(b)).refunds[0].viaRequest], [4, rid(6)]);
  ok("after 9 hours an agent's refund becomes a request (with reason) and applies only when the manager approves");

  // ---------- 3. paid invoice: Example 1 — refund reduces what's owed, no credit ----------
  const c = await inv("1002", [{ productId: "p1", qty: 10 }], 7); // 10,000
  assert.strictEqual((await pay(8, { [c]: "4000" }, 4000)).status, 201);
  await call(R, { ...W, method: "POST", query: { id: c }, body: { requestId: rid(9), lines: [{ index: 0, qty: 3 }] } });
  const cl = (await call("pages/api/accounting/clients/[id].js", { ...AC, query: { id: "1002" } })).json;
  assert.deepStrictEqual([cl.summary.balance, cl.summary.credit], [3000, 0]); // 7,000 − 4,000
  ok("refund on a partly paid invoice only lowers what the client owes — no credit");

  // ---------- 4. credit → money-return request → accountant ----------
  assert.strictEqual((await pay(10, { [c]: "3000" }, 3000)).status, 201); // now fully paid: 7,000
  await call(R, { ...W, method: "POST", query: { id: c }, body: { requestId: rid(11), lines: [{ index: 0, qty: 2 }] } }); // → 5,000; paid 7,000 → credit 2,000
  const cand = await call("pages/api/money-returns.js", { ...W, query: { candidates: "1" } });
  assert.deepStrictEqual(cand.json.invoices.map((i) => [i.orderId, i.credit]), [[c, 2000]]);
  const mr = await call("pages/api/money-returns.js", { ...W, method: "POST", body: { orderIds: [c], requestId: rid(12) } });
  assert.strictEqual(mr.status, 201, JSON.stringify(mr.json));
  assert.strictEqual((await call("pages/api/money-returns.js", { ...W, method: "POST", body: { orderIds: [c], requestId: rid(13) } })).status, 409); // already requested
  const list = await call("pages/api/money-returns.js", { ...AC, query: { status: "pending" } });
  assert.strictEqual(list.json.requests[0].total, 2000);
  const ap = await call("pages/api/money-returns.js", { ...AC, method: "POST", body: { id: rid(12), action: "approve", method: "bank", bank: "nile", ref: "4455667", date: today } });
  assert.strictEqual(ap.status, 200, JSON.stringify(ap.json));
  const cl2 = (await call("pages/api/accounting/clients/[id].js", { ...AC, query: { id: "1002" } })).json;
  assert.deepStrictEqual([cl2.summary.balance, cl2.summary.credit, cl2.returned], [0, 0, 2000]);
  assert.ok(cl2.lines.some((l) => l.kind === "return" && l.debit === 2000));
  const col = (await call("pages/api/accounting/collections.js", { ...AC, query: { from: today, to: today } })).json;
  assert.deepStrictEqual([col.total, col.returnedTotal, col.net], [7000, 2000, 5000]);
  ok("credit after a refund is returned only through a request the accountant approves (bank + reference or cash); it then shows in the statement and as money out in collections");

  // ---------- 5. full refund of a paid invoice waits for the money ----------
  const d = await inv("1000", [{ productId: "p2", qty: 6 }], 14); // 3,000
  assert.strictEqual((await pay(15, { [d]: "3000" }, 3000)).status, 201);
  const full = await call(R, { ...M, method: "POST", query: { id: d }, body: { requestId: rid(16), lines: [{ index: 0, qty: 6 }] } });
  assert.deepStrictEqual([full.json.full, full.json.awaitingMoney, full.json.credit], [true, true, 3000]);
  assert.deepStrictEqual([(await order(d)).status, (await order(d)).refundStatus], ["cancelled", "awaitingMoney"]);
  const m2 = await call("pages/api/money-returns.js", { ...W, method: "POST", body: { orderIds: [d], requestId: rid(17) } });
  await call("pages/api/money-returns.js", { ...AC, method: "POST", body: { id: rid(17), action: "approve", method: "cash", date: today } });
  assert.strictEqual((await order(d)).refundStatus, "full");
  // unpaid invoice fully refunded: simply refunded
  const e = await inv("1001", [{ productId: "p2", qty: 2 }], 18);
  const fe = await call(R, { ...W, method: "POST", query: { id: e }, body: { requestId: rid(19), lines: [{ index: 0, qty: 2 }] } });
  assert.deepStrictEqual([fe.json.full, fe.json.awaitingMoney, (await order(e)).refundStatus], [true, false, "full"]);
  for (const day of [today]) assert.strictEqual((await rebuildDay(day)).diffs.length, 0);
  assert.strictEqual((await rebuildClientBalances()).changed, 0);
  ok("full refund: cancelled with a refunded note; if it was paid it waits as 'awaiting money' until the return is approved; every total still matches a recount");

  console.log("ALL REFUND SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
