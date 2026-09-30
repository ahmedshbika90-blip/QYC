const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  await db.collection("products").doc("p1").set({ name: "Tahini", unit: "ctn", active: true, prices: { car1: 10 }, stock: { depot: 50, car1: 0, car2: 0, damaged: 0 } });
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const A2 = { role: "agent_car2", uid: "agentB" };

  // Loading/offloading can ONLY be created by fulfilling an agent's
  // shipment request now — there is no direct warehouse-keeper path.
  // car1's own requests go straight to "pending_warehouse"; car2's need
  // car1's approval first (covered separately in run3.js). This helper
  // creates a request as the given route's agent and fulfills it as the
  // warehouse keeper, returning the fulfill response — the same shape
  // the old direct endpoint used to return.
  async function shipAndFulfill({ route, type, qty, shipReqId, fulfillReqId, productId = "p1" }) {
    const agent = route === "car1" ? A1 : A2;
    const created = await call("pages/api/shipment-requests/create.js", { method: "POST", ...agent, body: { type, items: [{ productId, qty }], requestId: shipReqId } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    return { shipmentRequestId: created.json.id, fulfill: await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: created.json.id }, body: { requestId: fulfillReqId } }) };
  }

  const first = await shipAndFulfill({ route: "car1", type: "loading", qty: 10, shipReqId: "req-shiprequest-load01", fulfillReqId: "req-load-00000001" });
  assert.strictEqual(first.fulfill.status, 201, JSON.stringify(first.fulfill.json));
  // Re-fulfilling the SAME (already-fulfilled) shipment request is refused
  // as a duplicate regardless of what's in the body — the check is on the
  // request's own status, not on this call's requestId.
  const repeatFulfill = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: first.shipmentRequestId }, body: { requestId: "req-load-00000099" } });
  assert.ok(repeatFulfill.json.duplicate);
  assert.strictEqual(repeatFulfill.json.id, first.fulfill.json.id);
  await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: first.fulfill.json.id }, body: { action: "confirm" } });
  const again = await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: first.fulfill.json.id }, body: { action: "confirm" } });
  assert.strictEqual(again.status, 200);
  const st = (await get("products", "p1")).stock;
  assert.deepStrictEqual([st.depot, st.car1], [40, 10]);
  ok("loading via shipment request: re-fulfilling an already-fulfilled request is refused, double confirm moves stock once (depot 50→40, car 0→10)");

  const body = { nameFirst: "New", nameMiddle: "Store", nameLast: "Owner", storeName: "NS", location: "Souq", phone: "0912345678", storeClass: "A", requestId: "req-client-000001" };
  const a = await call("pages/api/clients/register.js", { method: "POST", ...A1, body });
  const b = await call("pages/api/clients/register.js", { method: "POST", ...A1, body });
  assert.strictEqual(a.status, 201, JSON.stringify(a.json)); assert.ok(b.json.duplicate);
  assert.strictEqual(a.json.clientId, b.json.clientId);
  assert.strictEqual(Object.keys(db._data.clients).length, 1);
  assert.strictEqual((await get("meta", "clientIdCounter")).value, 1000);
  ok("client registration: repeat returns same client " + a.json.clientId + ", no wasted ID");

  // 3. Daily sequence numbering: independent per car, per type, per day —
  // still assigned inside createMovementDoc, now only reachable by
  // fulfilling a shipment request.
  const car1LoadStart = (await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car1", type: "loading" } })).json.next;
  const car1OffStart = (await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car1", type: "offloading" } })).json.next;
  const car2LoadStart = (await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car2", type: "loading" } })).json.next;

  const l1 = await shipAndFulfill({ route: "car1", type: "loading", qty: 1, shipReqId: "req-shiprequest-seq01", fulfillReqId: "req-seq-00000001" });
  const l2 = await shipAndFulfill({ route: "car1", type: "loading", qty: 1, shipReqId: "req-shiprequest-seq02", fulfillReqId: "req-seq-00000002" });
  const off1 = await shipAndFulfill({ route: "car1", type: "offloading", qty: 1, shipReqId: "req-shiprequest-seq03", fulfillReqId: "req-seq-00000003" });
  const otherCarShip = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "loading", items: [{ productId: "p1", qty: 1 }], requestId: "req-shiprequest-seq04" } });
  assert.strictEqual(otherCarShip.status, 201, JSON.stringify(otherCarShip.json));
  // car2's request needs car1's approval before it can be fulfilled at all.
  const blockedFulfill = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: otherCarShip.json.id }, body: { requestId: "req-seq-00000004" } });
  assert.strictEqual(blockedFulfill.status, 400, JSON.stringify(blockedFulfill.json)); // not pending_warehouse yet
  await call("pages/api/shipment-requests/[id]/decide.js", { method: "PATCH", ...A1, query: { id: otherCarShip.json.id }, body: { action: "approve" } });
  const otherCar = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: otherCarShip.json.id }, body: { requestId: "req-seq-00000004" } });

  assert.deepStrictEqual([l1.fulfill.json.dailySeq, l2.fulfill.json.dailySeq], [car1LoadStart, car1LoadStart + 1]);
  assert.strictEqual(off1.fulfill.json.dailySeq, car1OffStart); // offloading counted separately from loading
  assert.strictEqual(otherCar.json.dailySeq, car2LoadStart); // car2 counted separately from car1
  const dup = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: l1.shipmentRequestId }, body: { requestId: "req-seq-00000099" } });
  assert.strictEqual(dup.json.dailySeq, car1LoadStart); // repeat returns the original number, doesn't consume a new one
  const nxt = await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car1", type: "loading" } });
  assert.strictEqual(nxt.json.next, car1LoadStart + 2);
  ok("daily sequence counts up correctly, stays independent per car+type, repeat doesn't burn a number; car2 blocked until car1 approves");

  // 4. Version counters bump on real changes only — this is what drives
  // near-live updates (lib/useLiveRefresh.js) without opening Firestore to
  // the browser.
  const v0 = (await call("pages/api/versions.js", SUP)).json.versions;
  // Reuses the client "a" registered earlier in this file (route car1) —
  // client "1000" doesn't exist in THIS file's database (it belongs to
  // run.js's separate one), so using it here would silently 404.
  const ord = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: a.json.clientId, items: [{ productId: "p1", qty: 1 }], requestId: "req-ver-00000001" } });
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  const v1 = (await call("pages/api/versions.js", SUP)).json.versions;
  assert.strictEqual(v1.orders_car1, v0.orders_car1 + 1);
  assert.strictEqual(v1.requests, v0.requests); // unrelated area untouched
  await shipAndFulfill({ route: "car1", type: "loading", qty: 1, shipReqId: "req-shiprequest-ver01", fulfillReqId: "req-ver-00000002" });
  const v2 = (await call("pages/api/versions.js", SUP)).json.versions;
  assert.strictEqual(v2.inventory, v0.inventory + 1);
  assert.ok(v2.shipmentRequests > v0.shipmentRequests); // the request itself also bumps its own area
  ok("version counters bump only their own area, so polling clients refetch only what actually changed");

  console.log("ALL EXTRA SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
