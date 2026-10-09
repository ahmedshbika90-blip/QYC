// Vans as data: vans added by the admin, agents assigned to a van and to a
// supervisor; everything that keyed on car1 / car2 works for any van.
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
const { clearServerCache } = require("../lib/serverCache");
const ADMIN = { role: "admin", uid: "adm" };
const M = { role: "manager", uid: "mgr" };
const SUP_A = { role: "agent_car1", uid: "supA", salesSupervisor: true };
const SUP_B = { role: "agent_car1", uid: "supB", salesSupervisor: true, van: "van-w2" };
const AG_W = { role: "agent_car1", uid: "agW", salesSupervisor: false, van: "van-w2", supervisorUid: "supB" }; // wholesale agent on the new van
const AG_R = { role: "agent_car2", uid: "agR", salesSupervisor: false, supervisorUid: "supA" };                   // retail agent, original van
const today = businessDay(new Date());

(async () => {
  await db.collection("meta").doc("statsState").set({ ready: true });
  // ---------- 1. vans managed by the admin ----------
  const V = "pages/api/vans/index.js";
  const l0 = await call(V, M);
  assert.deepStrictEqual(l0.json.vans.map((v) => [v.id, v.type]), [["car1", "wholesale"], ["car2", "retail"]]); // the originals exist without saving
  assert.strictEqual((await call(V, { ...M, method: "POST", body: { label: "x", type: "retail" } })).status, 403);
  const add = await call(V, { ...ADMIN, method: "POST", body: { newId: "van-w2", label: "عربة جملة ٢", type: "wholesale" } });
  assert.strictEqual(add.status, 200, JSON.stringify(add.json));
  assert.strictEqual((await call(V, { ...ADMIN, method: "POST", body: { newId: "van-w2", label: "y", type: "wholesale" } })).status, 400); // id taken
  assert.strictEqual((await call(V, { ...ADMIN, method: "POST", body: { id: "van-w2", label: "y", type: "retail" } })).status, 400); // type can't change
  clearServerCache();
  assert.deepStrictEqual((await call(V, M)).json.vans.map((v) => v.id), ["car1", "van-w2", "car2"]);
  ok("the admin adds vans (wholesale or retail); the two original vans need no setup; a van's type is fixed");

  // ---------- 2. an agent on the new van sells with wholesale prices from that van's stock ----------
  await db.collection("products").doc("p1").set({ name: "طحنية", active: true, prices: { car1: 1000, car2: 1300 }, stock: { depot: 100, car1: 10, car2: 10, "van-w2": 20 }, avgCost: 600 });
  const reg = await call("pages/api/clients/register.js", { ...AG_W, method: "POST", body: { nameFirst: "أ", nameMiddle: "ب", nameLast: "ج", storeName: "S", deliveryRoute: "خط", location: "L", phone: "0911111111", storeClass: "A", requestId: "req-vans-client-001" } });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.json));
  const cid = reg.json.clientId;
  assert.strictEqual(db._data.clients[cid].route, "van-w2");
  const inv = await call("pages/api/orders/create-staff.js", { ...AG_W, method: "POST", body: { clientId: cid, items: [{ productId: "p1", qty: 3 }], requestId: "req-vans-order-0001" } });
  assert.strictEqual(inv.status, 201, JSON.stringify(inv.json));
  assert.deepStrictEqual([inv.json.total, db._data.products.p1.stock["van-w2"], db._data.products.p1.stock.car1], [3000, 17, 10]);
  assert.strictEqual((await call("pages/api/orders/create-staff.js", { ...SUP_A, method: "POST", body: { clientId: cid, items: [{ productId: "p1", qty: 1 }], requestId: "req-vans-order-0002" } })).status, 403); // another van's client
  const pl = await call("pages/api/products/list.js", { ...AG_W, query: { route: "van-w2" } });
  assert.strictEqual(pl.json.products[0].price, 1000); // wholesale price
  assert.deepStrictEqual(Object.keys(pl.json.products[0].stock).sort(), ["damaged_van-w2", "depot", "van-w2"]); // only his own van (and its damaged goods)
  ok("a van's agent registers clients on his van, sells at his type's prices and from his van's stock; other vans' clients are off limits");

  // ---------- 3. dashboards, logs and accounting count every van ----------
  const sum = await call("pages/api/dashboard/summary.js", M);
  assert.strictEqual(sum.status, 200, JSON.stringify(sum.json));
  assert.strictEqual(sum.json.totals.w.qty, 3); // the new van counts as wholesale
  const rb = await rebuildDay(today);
  assert.strictEqual(rb.diffs.length, 0, JSON.stringify(rb.diffs));
  const logs = await call("pages/api/accounting/logs/index.js", { role: "accountant", uid: "acc", query: { route: "van-w2" } });
  assert.deepStrictEqual(logs.json.logs.map((l) => [l.id, l.total]), [["van-w2_" + today, 3000]]);
  const ex = await call("pages/api/executive/customers.js", { role: "executive", uid: "e" });
  assert.ok(ex.json.routes.some((r) => r.route === "van-w2" && r.invoices === 1));
  ok("manager and executive figures, invoice logs and accounting include the new van (by its sales type)");

  // ---------- 4. each agent's requests go to HIS supervisor ----------
  const mk = (who, n) => call("pages/api/shipment-requests/create.js", { ...who, method: "POST", body: { type: "loading", items: [{ productId: "p1", qty: 2 }], requestId: "req-vans-ship-000" + n } });
  const s1 = await mk(AG_W, 1);
  assert.strictEqual(s1.status, 201, JSON.stringify(s1.json));
  assert.deepStrictEqual([db._data.shipmentRequests["req-vans-ship-0001"].status, db._data.shipmentRequests["req-vans-ship-0001"].supervisorUid], ["pending_car1", "supB"]);
  const L = "pages/api/shipment-requests/list.js";
  assert.deepStrictEqual((await call(L, { ...SUP_B, query: { scope: "todecide" } })).json.requests.map((r) => r.id), ["req-vans-ship-0001"]);
  assert.deepStrictEqual((await call(L, { ...SUP_A, query: { scope: "todecide" } })).json.requests, []); // not his agent
  assert.strictEqual((await call("pages/api/shipment-requests/[id]/decide.js", { ...SUP_A, method: "PATCH", query: { id: "req-vans-ship-0001" }, body: { action: "approve" } })).status, 403);
  const ok1 = await call("pages/api/shipment-requests/[id]/decide.js", { ...SUP_B, method: "PATCH", query: { id: "req-vans-ship-0001" }, body: { action: "approve" } });
  assert.strictEqual(ok1.status, 200, JSON.stringify(ok1.json));
  // a request saved before supervisors were assigned can be decided by any supervisor
  await db.collection("shipmentRequests").doc("legacy-req").set({ type: "loading", status: "pending_car1", route: "car2", requestedBy: "old", requestedAt: new Date().toISOString(), items: [] });
  assert.ok((await call(L, { ...SUP_A, query: { scope: "todecide" } })).json.requests.some((r) => r.id === "legacy-req"));
  const n = await call("pages/api/notifications.js", SUP_A);
  assert.ok(!n.json.items.some((i) => i.id === "req-vans-ship-0001"));
  ok("several supervisors: each sees and decides only his own agents' requests; older unassigned requests stay open to any supervisor");

  // ---------- 5. every screen names any van ----------
  const N = require("../lib/vanNames");
  const LB = require("../lib/labels");
  assert.deepStrictEqual([N.vanName("car1"), LB.ROUTE_LABELS_SHORT.car2], ["مبيعات جملة", "مبيعات تجزئة"]);
  N.registerVans([{ id: "car1", label: "x", type: "wholesale" }, { id: "car2", label: "y", type: "retail" }, { id: "van-w2", label: "عربة جملة ٢", type: "wholesale" }]);
  assert.deepStrictEqual([N.vanName("van-w2"), LB.ROUTE_LABELS_SHORT["van-w2"], LB.ROUTE_LABELS["van-w2"], N.vanTypeOfId("van-w2")], ["عربة جملة ٢", "عربة جملة ٢", "عربة جملة ٢", "wholesale"]);
  assert.deepStrictEqual(N.vanOptions(true).map((o) => o[0]), ["car1", "car2", "van-w2"]);
  // a new van's invoices refresh the wholesale screens (orders_car1)
  const before = db._data.meta.versions.orders_car1 || 0;
  await require("../lib/versions").bumpVersions(["orders_van-w2"]);
  assert.strictEqual(db._data.meta.versions.orders_car1, before + 1);
  assert.ok(!("orders_van-w2" in db._data.meta.versions));
  // the source no longer hard-codes the two vans where screens list vans
  const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const joined = ["pages/invoices.js", "pages/clients/index.js", "pages/margin.js", "pages/requests/index.js", "pages/reports/sales.js"].map(src).join(" ");
  assert.ok(!joined.includes('["car1", "مبيعات جملة"], ["car2"'));
  ok("screens name and list every van (filters, labels, stock, warehouse sections); a new van refreshes its sales type's screens");

  // ---------- 6. wholesale / retail are categories over vans ----------
  const fl = require("../lib/vanFilter");
  assert.deepStrictEqual(await fl.resolveVanFilter("type:wholesale"), ["car1", "van-w2"]);
  assert.deepStrictEqual(await fl.resolveVanFilter("type:retail"), ["car2"]);
  assert.deepStrictEqual(await fl.resolveVanFilter("van-w2"), ["van-w2"]);
  assert.strictEqual(await fl.resolveVanFilter(""), null);
  await assert.rejects(fl.resolveVanFilter("nope"));
  const mW = await call("pages/api/reports/margin.js", { ...M, query: { route: "type:wholesale" } });
  assert.strictEqual(mW.status, 200, JSON.stringify(mW.json));
  const mV = await call("pages/api/reports/margin.js", { ...M, query: { route: "van-w2" } });
  const mR = await call("pages/api/reports/margin.js", { ...M, query: { route: "type:retail" } });
  assert.ok(mW.json.totals.revenue >= mV.json.totals.revenue && mV.json.totals.revenue === 3000 && mR.json.totals.revenue === 0);
  const ol = await call("pages/api/orders/list.js", { ...M, query: { route: "type:wholesale" } });
  assert.ok(ol.json.orders.length >= 1 && ol.json.orders.every((o) => ["car1", "van-w2"].includes(o.route)));
  assert.ok(N.matchesVanFilter("type:wholesale", "van-w2") && !N.matchesVanFilter("type:retail", "van-w2") && N.matchesVanFilter("van-w2", "van-w2"));
  ok("filters take a whole category (all wholesale / all retail) or one van — margin, invoices, history, requests");

  console.log("ALL VANS SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
