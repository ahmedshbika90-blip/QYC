const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Architectural guard: loading/offloading may ONLY be created by fulfilling
// a shipment request (see /api/shipment-requests/[id]/fulfill.js). If this
// file ever reappears, that rule is silently broken — fail loudly instead.
assert.ok(
  !fs.existsSync(path.join(__dirname, "..", "pages/api/inventory/movement.js")),
  "pages/api/inventory/movement.js must not exist — loading/offloading can only be created via a fulfilled shipment request"
);

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

  // 5. Offloading: no car1 gate for EITHER car, and it finalizes the
  // moment the warehouse keeper fulfills it — no agent confirmation step
  // exists for this direction at all.
  const offCar1Req = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "offloading", items: [{ productId: "p1", qty: 2 }], requestId: "req-shipoff-car1-01" } });
  assert.strictEqual(offCar1Req.status, 201, JSON.stringify(offCar1Req.json));
  const offCar1List = (await call("pages/api/shipment-requests/list.js", { ...A1, query: { scope: "own" } })).json.requests;
  assert.strictEqual(offCar1List.find((r) => r.id === offCar1Req.json.id).status, "pending_warehouse");
  const offCar1Fulfill = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: offCar1Req.json.id }, body: { requestId: "req-off-car1-doc-01" } });
  assert.strictEqual(offCar1Fulfill.status, 201, JSON.stringify(offCar1Fulfill.json));
  const offCar1Doc = await get("inventoryDocs", offCar1Fulfill.json.id);
  assert.strictEqual(offCar1Doc.status, "confirmed"); // finalized immediately, no agent step
  assert.strictEqual(offCar1Doc.agentConfirmedBy, null);

  // car2's offloading also skips straight to "pending_warehouse" — no
  // car1 approval step — and car1 can't even attempt to decide on it.
  const offCar2Req = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "offloading", items: [{ productId: "p1", qty: 2 }], requestId: "req-shipoff-car2-01" } });
  assert.strictEqual(offCar2Req.status, 201, JSON.stringify(offCar2Req.json));
  const offCar2List = (await call("pages/api/shipment-requests/list.js", { ...A2, query: { scope: "own" } })).json.requests;
  assert.strictEqual(offCar2List.find((r) => r.id === offCar2Req.json.id).status, "pending_warehouse");
  const badOffDecide = await call("pages/api/shipment-requests/[id]/decide.js", { method: "PATCH", ...A1, query: { id: offCar2Req.json.id }, body: { action: "approve" } });
  assert.strictEqual(badOffDecide.status, 400, JSON.stringify(badOffDecide.json)); // offloading never needs car1's approval
  const offCar2Fulfill = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: offCar2Req.json.id }, body: { requestId: "req-off-car2-doc-01" } });
  assert.strictEqual(offCar2Fulfill.status, 201, JSON.stringify(offCar2Fulfill.json));

  // Trying to "confirm" an already-finalized offloading document (there's
  // no such step for it) is correctly refused, not silently accepted.
  const pointlessConfirm = await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: offCar1Fulfill.json.id }, body: { action: "confirm" } });
  assert.strictEqual(pointlessConfirm.status, 400);

  const stockAfterOffloads = (await get("products", "p1")).stock;
  assert.deepStrictEqual(
    [stockAfterOffloads.depot, stockAfterOffloads.car1, stockAfterOffloads.car2],
    [93, 3, 4] // depot 89+2+2, car1 5-2, car2 6-2 — both offloads moved stock immediately
  );
  ok("offloading: no car1 gate for either car, finalizes immediately on fulfill, no leftover confirm step");

  // 6. /api/requests/[id]/index.js: an agent can read their OWN change
  // request detail (read-only), not anyone else's.
  await db.collection("changeRequests").doc("req-detail-doc-000001").set({
    orderId: "irrelevant", route: "car1", clientId: "2000", clientName: "C", type: "cancel", reason: "r",
    currentItems: [], currentTotal: 0, proposedItems: null, proposedTotal: null,
    status: "pending", requestedBy: "agentA", requestedAt: new Date().toISOString(),
    decidedBy: null, decidedAt: null, decisionNote: "",
  });
  const ownRead = await call("pages/api/requests/[id]/index.js", { ...A1, query: { id: "req-detail-doc-000001" } });
  assert.strictEqual(ownRead.status, 200, JSON.stringify(ownRead.json));
  const otherRead = await call("pages/api/requests/[id]/index.js", { ...A2, query: { id: "req-detail-doc-000001" } });
  assert.strictEqual(otherRead.status, 403); // not the requesting agent
  const supRead = await call("pages/api/requests/[id]/index.js", { ...SUP, query: { id: "req-detail-doc-000001" } });
  assert.strictEqual(supRead.status, 200); // supervisor can read any
  ok("an agent can read their OWN change-request detail read-only; a different agent is refused; supervisor sees any");

  // 7. /api/action-items.js: the unified "needs your action" count per role.
  const supCount = (await call("pages/api/action-items.js", SUP)).json.count;
  assert.strictEqual(supCount, 1); // the pending changeRequests doc set up just above
  const wkCount = (await call("pages/api/action-items.js", WK)).json.count;
  assert.strictEqual(wkCount, 1); // reqCar1 from scenario 3 was created but never fulfilled — still sitting there
  const freshOff = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "offloading", items: [{ productId: "p1", qty: 1 }], requestId: "req-actioncount-off01" } });
  assert.strictEqual(freshOff.status, 201, JSON.stringify(freshOff.json));
  const wkCount2 = (await call("pages/api/action-items.js", WK)).json.count;
  assert.strictEqual(wkCount2, 2); // plus the fresh offloading request, also landing straight in pending_warehouse
  const freshCar2Load = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "loading", items: [{ productId: "p1", qty: 1 }], requestId: "req-actioncount-load01" } });
  const car1Count = (await call("pages/api/action-items.js", A1)).json.count;
  assert.strictEqual(car1Count, 1); // car2's loading request awaiting car1's approval (the offloading one never gates through car1)
  ok("action-items: supervisor sees pending change requests, warehouse keeper sees pending_warehouse, car1 sees car2's loading requests to decide");

  console.log("ALL SESSION-3 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
