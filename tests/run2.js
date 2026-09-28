const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  await db.collection("products").doc("p1").set({ name: "Tahini", unit: "ctn", active: true, prices: { car1: 10 }, stock: { depot: 50, car1: 0, car2: 0 } });
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const mv = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 10 }], requestId: "req-load-00000001" } });
  assert.strictEqual(mv.status, 201, JSON.stringify(mv.json));
  const mv2 = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 10 }], requestId: "req-load-00000001" } });
  assert.ok(mv2.json.duplicate);
  await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: "req-load-00000001" }, body: { action: "confirm" } });
  const again = await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: "req-load-00000001" }, body: { action: "confirm" } });
  assert.strictEqual(again.status, 200);
  const st = (await get("products", "p1")).stock;
  assert.deepStrictEqual([st.depot, st.car1], [40, 10]);
  ok("loading: duplicate doc prevented, double confirm moves stock once (depot 50→40, car 0→10)");

  const body = { name: "New Store", storeName: "NS", location: "Souq", phone: "0912345678", storeClass: "A", requestId: "req-client-000001" };
  const a = await call("pages/api/clients/register.js", { method: "POST", ...A1, body });
  const b = await call("pages/api/clients/register.js", { method: "POST", ...A1, body });
  assert.strictEqual(a.status, 201, JSON.stringify(a.json)); assert.ok(b.json.duplicate);
  assert.strictEqual(a.json.clientId, b.json.clientId);
  assert.strictEqual(Object.keys(db._data.clients).length, 1);
  assert.strictEqual((await get("meta", "clientIdCounter")).value, 1000);
  ok("client registration: repeat returns same client " + a.json.clientId + ", no wasted ID");
  console.log("ALL EXTRA SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
