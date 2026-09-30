const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  const A2 = { role: "agent_car2", uid: "agentB" };
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const DV = { role: "depot_viewer", uid: "dv" };

  await db.collection("products").doc("p1").set({
    name: "Tahini", unit: "ctn", active: true,
    prices: { car1: 10, car2: 12 },
    stock: { depot: 100, car1: 10, car2: 0, damaged: 0 },
    minStock: 5,
  });

  // 1. Damage write-off: moves qty OUT of a real bucket and INTO
  // "damaged" — never below zero, logged, and a repeat submission
  // doesn't double-count it.
  const dmg1 = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "p1", qty: 5 }], requestId: "req-dmg-00000001" } });
  assert.strictEqual(dmg1.status, 201, JSON.stringify(dmg1.json));
  const dmg2 = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "p1", qty: 5 }], requestId: "req-dmg-00000001" } });
  assert.ok(dmg2.json.duplicate);
  const afterDmg = (await get("products", "p1")).stock;
  assert.deepStrictEqual([afterDmg.depot, afterDmg.damaged], [95, 5]);
  const tooMuch = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "p1", qty: 9999 }], requestId: "req-dmg-00000002" } });
  assert.strictEqual(tooMuch.status, 400);
  ok("damage write-off: depot 100→95, damaged 0→5, repeat doesn't double it, can't go negative");

  // 2. Free sample (zero revenue, stock still moves) and a per-line
  // discount (reduced revenue, stock still moves) — both computed
  // server-side, never trusted from the client's own subtotal.
  await db.collection("clients").doc("2000").set({ name: "C", storeName: "S", location: "L", route: "car1", phone: "0900000000", whatsapp: "0900000000", storeClass: "A", active: true });
  const ord = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: {
    clientId: "2000",
    items: [
      { productId: "p1", qty: 2, freeSample: true },
      { productId: "p1", qty: 3, discount: 5 },
    ],
    requestId: "req-freesample-01",
  }});
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  assert.strictEqual(ord.json.items[0].subtotal, 0); // 2 × 10, free sample
  assert.strictEqual(ord.json.items[1].subtotal, 25); // 3 × 10 − 5 discount
  assert.strictEqual(ord.json.total, 25);
  const afterSale = (await get("products", "p1")).stock;
  assert.strictEqual(afterSale.car1, 5); // both lines still moved real stock (2 + 3)
  ok("free sample (0 revenue) + line discount (25 not 30), both still move stock, total computed server-side");

  // 3. Shipment-request workflow: car1 skips straight to the warehouse
  // keeper; car2 needs car1's approval first, and only car1 (not the
  // warehouse keeper or car2 itself) may decide on it.
  const reqCar1 = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "loading", items: [{ productId: "p1", qty: 4 }], requestId: "req-ship-00000001" } });
  assert.strictEqual(reqCar1.status, 201, JSON.stringify(reqCar1.json));
  const car1List = (await call("pages/api/shipment-requests/list.js", { ...A1, query: { scope: "own" } })).json.requests;
  assert.strictEqual(car1List.find((r) => r.id === reqCar1.json.id).status, "pending_warehouse");

  const reqCar2 = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "loading", items: [{ productId: "p1", qty: 6 }], requestId: "req-ship-00000002" } });
  assert.strictEqual(reqCar2.status, 201, JSON.stringify(reqCar2.json));
  const car2List = (await call("pages/api/shipment-requests/list.js", { ...A2, query: { scope: "own" } })).json.requests;
  assert.strictEqual(car2List.find((r) => r.id === reqCar2.json.id).status, "pending_car1");

  const wkQueueEarly = (await call("pages/api/shipment-requests/list.js", { ...WK, query: { status: "pending_warehouse" } })).json.requests;
  assert.ok(!wkQueueEarly.some((r) => r.id === reqCar2.json.id)); // not visible to the warehouse keeper yet

  const badDecide = await call("pages/api/shipment-requests/[id]/decide.js", { method: "PATCH", ...A2, query: { id: reqCar2.json.id }, body: { action: "approve" } });
  assert.strictEqual(badDecide.status, 403); // car2 can't approve its own request

  const approve = await call("pages/api/shipment-requests/[id]/decide.js", { method: "PATCH", ...A1, query: { id: reqCar2.json.id }, body: { action: "approve" } });
  assert.strictEqual(approve.status, 200, JSON.stringify(approve.json));
  const wkQueueLate = (await call("pages/api/shipment-requests/list.js", { ...WK, query: { status: "pending_warehouse" } })).json.requests;
  assert.ok(wkQueueLate.some((r) => r.id === reqCar2.json.id)); // now visible

  const fulfill = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: reqCar2.json.id }, body: { requestId: "req-ship-fulfill-01" } });
  assert.strictEqual(fulfill.status, 201, JSON.stringify(fulfill.json));
  const confirmCar2 = await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A2, query: { id: fulfill.json.id }, body: { action: "confirm" } });
  assert.strictEqual(confirmCar2.status, 200, JSON.stringify(confirmCar2.json));
  const stockAfterShip = (await get("products", "p1")).stock;
  assert.strictEqual(stockAfterShip.car2, 6); // the fulfilled+confirmed loading actually moved stock
  ok("shipment requests: car1 → warehouse directly; car2 → needs car1's approval → then warehouse → agent confirms → stock moves");

  // 4. depot_viewer: read-only shape, same restricted fields as the
  // warehouse keeper (no prices, no car stock), and can't write anything.
  const dvList = await call("pages/api/products/list.js", { ...DV, query: { all: "1" } });
  const dvProduct = dvList.json.products.find((p) => p.id === "p1");
  assert.strictEqual(dvProduct.prices, undefined);
  assert.strictEqual(dvProduct.stock.car1, undefined);
  assert.strictEqual(dvProduct.stock.depot, 89); // 95 after damage, −6 more from the fulfilled+confirmed loading above
  ok("depot_viewer sees depot/damaged balances only — no prices, no car stock");

  console.log("ALL SESSION-3 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
