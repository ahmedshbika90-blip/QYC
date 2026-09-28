// Runs the REAL API handlers against an in-memory database (tests/mockfs.js)
// that enforces Firestore's transaction rules. No Firebase connection needed.
// Run: npm test
const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { makeDb, FV } = require("./mockfs");

const db = makeDb();
const fbPath = path.join(ROOT, "lib/firebaseAdmin.js");
require.cache[fbPath] = {
  id: fbPath, filename: fbPath, loaded: true,
  exports: {
    admin: { firestore: { FieldValue: FV } },
    adminDb: db,
    adminAuth: { verifyIdToken: async (t) => JSON.parse(Buffer.from(t, "base64").toString()) },
  },
};

function load(rel) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, "utf8").replace(/export default async function handler/, "module.exports = async function handler");
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports;
}
const tok = (role, uid) => "Bearer " + Buffer.from(JSON.stringify({ role, uid })).toString("base64");
async function call(rel, { method = "GET", role, uid, query = {}, body } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  await h({ method, query, body, headers: { authorization: tok(role, uid) } }, res);
  return { status, json };
}
const get = async (c, id) => (await db.collection(c).doc(id).get()).data();
const A1 = { role: "agent_car1", uid: "agentA" };
const SUP = { role: "supervisor", uid: "sup" };
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
let passed = 0;
const ok = (msg) => { passed++; console.log("PASS", passed + ":", msg); };

(async () => {
  // ---------- setup ----------
  await db.collection("products").doc("p1").set({ name: "Tahini", unit: "ctn", active: true, prices: { car1: 10, car2: 12 }, stock: { depot: 50, car1: 20, car2: 0 }, avgCost: 6 });
  await db.collection("clients").doc("1000").set({ name: "Store A", route: "car1", active: true });

  // 1. create invoice — stock, unitCost saved, cost hidden from agent
  const c1 = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "1000", items: [{ productId: "p1", qty: 3 }], requestId: "req-invoice-000001" } });
  assert.strictEqual(c1.status, 201, JSON.stringify(c1.json));
  assert.strictEqual((await get("products", "p1")).stock.car1, 17);
  assert.strictEqual((await get("orders", "req-invoice-000001")).items[0].unitCost, 6);
  assert.strictEqual(c1.json.items[0].unitCost, undefined);
  ok("invoice created: car stock 20→17, cost saved on line, hidden from agent");

  // 2. duplicate submission
  const c2 = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "1000", items: [{ productId: "p1", qty: 3 }], requestId: "req-invoice-000001" } });
  assert.ok(c2.json.duplicate); assert.strictEqual((await get("products", "p1")).stock.car1, 17);
  ok("repeat submission returns original — stock taken once");

  // 3. agent edits unlocked invoice
  const e1 = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-invoice-000001" }, body: { items: [{ productId: "p1", qty: 5 }] } });
  assert.strictEqual(e1.status, 200, JSON.stringify(e1.json));
  assert.strictEqual((await get("products", "p1")).stock.car1, 15);
  ok("agent edits unlocked invoice (3→5): stock 17→15");

  // 4. lock by time → agent blocked
  await db.collection("orders").doc("req-invoice-000001").update({ createdAt: hoursAgo(10) });
  const e2 = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-invoice-000001" }, body: { items: [{ productId: "p1", qty: 1 }] } });
  assert.strictEqual(e2.status, 403);
  const x2 = await call("pages/api/orders/[id]/status.js", { method: "PATCH", ...A1, query: { id: "req-invoice-000001" }, body: { status: "cancelled" } });
  assert.strictEqual(x2.status, 403);
  const n2 = await call("pages/api/orders/[id]/status.js", { method: "PATCH", ...A1, query: { id: "req-invoice-000001" }, body: { notes: "called client" } });
  assert.strictEqual(n2.status, 200);
  ok("after 9h: agent edit & cancel blocked (403), notes still allowed");

  // 5. detail/list show lock + strip cost for agent
  const d1 = await call("pages/api/orders/[id]/index.js", { ...A1, query: { id: "req-invoice-000001" } });
  assert.strictEqual(d1.json.locked, true); assert.strictEqual(d1.json.lockReason, "time");
  assert.strictEqual(d1.json.items[0].unitCost, undefined); assert.strictEqual(d1.json.editHistory, undefined);
  const l1 = await call("pages/api/orders/list.js", { ...A1, query: { from: hoursAgo(48) } });
  assert.strictEqual(l1.json.orders[0].items[0].unitCost, undefined);
  ok("agent views: locked=true (server clock), no cost, no edit history");

  // 6. edit request
  const r1 = await call("pages/api/requests/create.js", { method: "POST", ...A1, body: { orderId: "req-invoice-000001", type: "edit", items: [{ productId: "p1", qty: 2 }], reason: "client returned 3", requestId: "req-change-0000001" } });
  assert.strictEqual(r1.status, 201, JSON.stringify(r1.json));
  assert.strictEqual((await get("orders", "req-invoice-000001")).pendingRequest.id, "req-change-0000001");
  assert.strictEqual((await get("products", "p1")).stock.car1, 15);
  const r1b = await call("pages/api/requests/create.js", { method: "POST", ...A1, body: { orderId: "req-invoice-000001", type: "cancel", reason: "x", requestId: "req-change-0000002" } });
  assert.strictEqual(r1b.status, 409);
  ok("request created, invoice unchanged until approval; second request refused (409)");

  // 7. supervisor approves; repeat approve is harmless
  const ap = await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-change-0000001" }, body: { action: "approve", note: "ok" } });
  assert.strictEqual(ap.status, 200, JSON.stringify(ap.json));
  let o = await get("orders", "req-invoice-000001");
  assert.strictEqual(o.items[0].qty, 2); assert.strictEqual(o.pendingRequest, undefined);
  assert.strictEqual(o.lastRequest.status, "approved"); assert.strictEqual(o.editHistory.at(-1).viaRequest, "req-change-0000001");
  assert.strictEqual((await get("products", "p1")).stock.car1, 18);
  const ap2 = await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-change-0000001" }, body: { action: "approve" } });
  assert.strictEqual(ap2.json.status, "repeat"); assert.strictEqual((await get("products", "p1")).stock.car1, 18);
  ok("approval applied (5→2, stock 15→18), history links the request; double approve changes nothing");

  // 8. cancel request → approve → stock back once
  await call("pages/api/requests/create.js", { method: "POST", ...A1, body: { orderId: "req-invoice-000001", type: "cancel", reason: "wrong client", requestId: "req-change-0000003" } });
  await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-change-0000003" }, body: { action: "approve" } });
  await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-change-0000003" }, body: { action: "approve" } });
  assert.strictEqual((await get("orders", "req-invoice-000001")).status, "cancelled");
  assert.strictEqual((await get("products", "p1")).stock.car1, 20);
  ok("cancel approved: stock 18→20, returned exactly once");

  // 9. requests list: pending empty, history has 2 approved
  const lp = await call("pages/api/requests/list.js", { ...SUP, query: { status: "pending" } });
  const lh = await call("pages/api/requests/list.js", { ...SUP, query: { status: "approved", route: "car1" } });
  assert.strictEqual(lp.json.requests.length, 0); assert.strictEqual(lh.json.requests.length, 2);
  const la = await call("pages/api/requests/list.js", { ...A1, query: { status: "pending" } });
  assert.strictEqual(la.status, 403);
  ok("requests list: filters by status & car; agents refused (403)");

  // 10. report + share-lock + margin
  await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "1000", items: [{ productId: "p1", qty: 4 }], requestId: "req-invoice-000002" } });
  const today = new Date().toISOString().slice(0, 10);
  const rep = await call("pages/api/reports/sales.js", { ...A1, query: { from: today, to: today } });
  assert.strictEqual(rep.status, 200, JSON.stringify(rep.json)); assert.strictEqual(rep.json.orderCount, 1);
  let m = await call("pages/api/reports/margin.js", { ...SUP, query: { from: today } });
  assert.strictEqual(m.json.invoiceCount, 0); assert.strictEqual(m.json.notFinalizedCount, 1);
  const lk = await call("pages/api/reports/lock.js", { method: "POST", ...A1, body: { from: today, to: today, requestId: "req-lock-00000001" } });
  assert.strictEqual(lk.json.locked, 1);
  assert.ok((await get("orders", "req-invoice-000002")).lockedAt);
  m = await call("pages/api/reports/margin.js", { ...SUP, query: { from: today } });
  assert.strictEqual(m.json.invoiceCount, 1);
  assert.deepStrictEqual([m.json.totals.revenue, m.json.totals.cost, m.json.totals.margin, m.json.totals.marginPct], [40, 24, 16, 40]);
  const ma = await call("pages/api/reports/margin.js", { ...A1, query: { from: today } });
  assert.strictEqual(ma.status, 403);
  ok("sharing locks the report's invoices; margin counts only locked: 40 − 24 = 16 (40%); agents refused");

  // 11. weighted average cost on approved receipt
  await db.collection("inventoryDocs").doc("rcv1").set({ type: "received", route: null, status: "pending", items: [{ productId: "p1", name: "Tahini", unit: "ctn", qty: 70, costPrice: null }], createdAt: new Date().toISOString() });
  const onHand = (await get("products", "p1")).stock; // depot 50 + car1 16 + car2 0 = 66 @ 6
  const wac = await call("pages/api/inventory/[id]/approve.js", { method: "PATCH", ...SUP, query: { id: "rcv1" }, body: { action: "approve", costPrices: { p1: 8 } } });
  assert.strictEqual(wac.status, 200, JSON.stringify(wac.json));
  const expected = Math.round(((onHand.depot + onHand.car1 + onHand.car2) * 6 + 70 * 8) / (onHand.depot + onHand.car1 + onHand.car2 + 70) * 100) / 100;
  assert.strictEqual((await get("products", "p1")).avgCost, expected);
  assert.strictEqual((await get("products", "p1")).stock.depot, onHand.depot + 70);
  ok(`weighted average cost: 66 @ 6 + 70 @ 8 → ${expected}; depot +70`);

  // 12. cost hidden from agent in product list
  const pl = await call("pages/api/products/list.js", { ...A1 });
  assert.strictEqual(pl.json.products[0].avgCost, undefined);
  const ps = await call("pages/api/products/list.js", { ...SUP });
  assert.strictEqual(ps.json.products[0].avgCost, expected);
  ok("product cost visible to supervisor only");

  console.log(`\nALL ${passed} SCENARIOS PASSED`);
})().catch((e) => { console.error("FAIL:", e.message); console.error(e.stack.split("\n").slice(0, 4).join("\n")); process.exit(1); });
