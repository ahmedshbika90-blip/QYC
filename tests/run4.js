// Session 4: whole-number quantities, read-only fulfilment, the 12-hour client
// edit lock with supervisor approval.
const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const SUP = { role: "supervisor", uid: "sup" };

  await db.collection("products").doc("p1").set({
    name: "Sugar", unit: "kg", active: true,
    prices: { car1: 10, car2: 12 },
    stock: { depot: 10, car1: 3, car2: 0, damaged: 0 },
  });
  const { parseDecimal, parseQty, isValidQty } = require(path.join(ROOT, "lib/qty"));

  // 1. Money still parses decimals; quantities are whole numbers only.
  assert.strictEqual(parseDecimal("2.5"), 2.5);
  assert.strictEqual(parseDecimal("٢٫٥"), 2.5);
  assert.strictEqual(parseDecimal("0,25"), 0.25);
  assert.ok(Number.isNaN(parseDecimal("2.5.1")));
  assert.strictEqual(parseQty("١٢"), 12);
  assert.ok(Number.isNaN(parseQty("1.5")) && Number.isNaN(parseQty("1.0")) && Number.isNaN(parseQty(0.5)));
  assert.ok(!isValidQty("0") && !isValidQty("0.5") && !isValidQty("1٫5") && isValidQty("1") && isValidQty("٣"));
  ok("money parses decimals; quantities accept whole numbers only (Arabic digits too), fractions refused");

  // 2. A shipment request, fulfilled exactly as sent — items in the
  // keeper's body are ignored. A fractional request is refused.
  const frac = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "loading", items: [{ productId: "p1", qty: "1.1" }], requestId: "req-dec-load-0000" } });
  assert.strictEqual(frac.status, 400, JSON.stringify(frac.json));
  const reqLoad = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "loading", items: [{ productId: "p1", qty: "٢" }], requestId: "req-dec-load-0001" } });
  assert.strictEqual(reqLoad.status, 201, JSON.stringify(reqLoad.json));
  assert.strictEqual((await get("shipmentRequests", reqLoad.json.id)).items[0].qty, 2);
  const tampered = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: reqLoad.json.id }, body: { requestId: "req-dec-doc-00001", items: [{ productId: "p1", qty: 9 }] } });
  assert.strictEqual(tampered.status, 201, JSON.stringify(tampered.json));
  const doc = await get("inventoryDocs", tampered.json.id);
  assert.strictEqual(doc.items[0].qty, 2); // the keeper's edited 9 was ignored
  assert.strictEqual((await get("shipmentRequests", reqLoad.json.id)).status, "fulfilled");
  await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: tampered.json.id }, body: { action: "confirm" } });
  const st = (await get("products", "p1")).stock;
  assert.deepStrictEqual([st.depot, st.car1], [8, 5]);
  ok("fraction refused; request of ٢ fulfilled exactly as sent (keeper can't change it): depot 8, car1 5");

  // 3. Offloading can't exceed what's on the car.
  const tooMuch = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "offloading", items: [{ productId: "p1", qty: 6 }], requestId: "req-dec-off-00001" } });
  assert.strictEqual(tooMuch.status, 409, JSON.stringify(tooMuch.json));
  const exact = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "offloading", items: [{ productId: "p1", qty: 5 }], requestId: "req-dec-off-00002" } });
  assert.strictEqual(exact.status, 201, JSON.stringify(exact.json));
  const dupLine = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "loading", items: [{ productId: "p1", qty: 1 }, { productId: "p1", qty: 1 }], requestId: "req-dec-dup-00001" } });
  assert.strictEqual(dupLine.status, 400);
  ok("offloading capped at the car's stock (6 > 5 refused, 5 accepted); duplicate lines refused");

  // 4. Fractional invoice quantities are refused; whole ones accepted.
  await db.collection("clients").doc("3000").set({ name: "C", storeName: "S", location: "L", route: "car1", phone: "0900000000", whatsapp: "0900000000", storeClass: "A", active: true, createdAt: new Date().toISOString() });
  await db.collection("products").doc("p2").set({ name: "Rice", unit: "kg", active: true, prices: { car1: 4, car2: 5 }, stock: { depot: 0, car1: 2, car2: 0, damaged: 0 } });
  const fracOrd = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "3000", items: [{ productId: "p2", qty: 0.5 }], requestId: "req-dec-order-000" } });
  assert.strictEqual(fracOrd.status, 400, JSON.stringify(fracOrd.json));
  const ord = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "3000", items: [{ productId: "p2", qty: 1 }], requestId: "req-dec-order-001" } });
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  assert.strictEqual(ord.json.total, 4);
  assert.strictEqual((await get("products", "p2")).stock.car1, 1);
  ok("invoice for 0.5 refused; invoice for 1 accepted: total 4.00, car stock 2 → 1");

  // 5. Client edit lock: free within 12h, supervisor approval after.
  const fresh = await call("pages/api/clients/[id]/index.js", { method: "PATCH", ...A1, query: { id: "3000" }, body: { storeName: "S2" } });
  assert.strictEqual(fresh.status, 200, JSON.stringify(fresh.json));
  const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  await db.collection("clients").doc("3000").update({ createdAt: old });
  const lockedEdit = await call("pages/api/clients/[id]/index.js", { method: "PATCH", ...A1, query: { id: "3000" }, body: { storeName: "S3" } });
  assert.strictEqual(lockedEdit.status, 423);
  assert.strictEqual(lockedEdit.json.code, "CLIENT_LOCKED");
  const supEdit = await call("pages/api/clients/[id]/index.js", { method: "PATCH", ...SUP, query: { id: "3000" }, body: { location: "L2" } });
  assert.strictEqual(supEdit.status, 200); // supervisor is never locked

  const noReason = await call("pages/api/clients/[id]/edit-request.js", { method: "POST", ...A1, query: { id: "3000" }, body: { storeName: "S3", requestId: "req-client-edit-01" } });
  assert.strictEqual(noReason.status, 400);
  const nothing = await call("pages/api/clients/[id]/edit-request.js", { method: "POST", ...A1, query: { id: "3000" }, body: { storeName: "S2", reason: "x", requestId: "req-client-edit-02" } });
  assert.strictEqual(nothing.status, 400); // no actual change
  const er = await call("pages/api/clients/[id]/edit-request.js", { method: "POST", ...A1, query: { id: "3000" }, body: { storeName: "S3", phone: "0911111111", reason: "غيّر المحل اسمه", requestId: "req-client-edit-03" } });
  assert.strictEqual(er.status, 201, JSON.stringify(er.json));
  assert.strictEqual((await get("clients", "3000")).storeName, "S2"); // unchanged until approved
  const second = await call("pages/api/clients/[id]/edit-request.js", { method: "POST", ...A1, query: { id: "3000" }, body: { storeName: "S4", reason: "x", requestId: "req-client-edit-04" } });
  assert.strictEqual(second.status, 409); // one pending at a time

  const supNotifs = (await call("pages/api/notifications.js", SUP)).json.items;
  assert.strictEqual(supNotifs.find((it) => it.id === "req-client-edit-03").requestType, "طلب تعديل بيانات عميل");
  const detail = await call("pages/api/requests/[id]/index.js", { ...SUP, query: { id: "req-client-edit-03" } });
  assert.strictEqual(detail.json.client.storeName, "S2");
  assert.deepStrictEqual(detail.json.proposedClient, { storeName: "S3", phone: "0911111111" });

  const approve = await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-client-edit-03" }, body: { action: "approve", note: "تم" } });
  assert.strictEqual(approve.status, 200, JSON.stringify(approve.json));
  const after = await get("clients", "3000");
  assert.deepStrictEqual([after.storeName, after.phone, after.location, after.pendingRequest], ["S3", "0911111111", "L2", undefined]);
  const agentNotifs = (await call("pages/api/notifications.js", A1)).json.items;
  const decided = agentNotifs.find((it) => it.id === "req-client-edit-03");
  assert.deepStrictEqual([decided.needsAction, decided.state, decided.note], [false, "تمت الموافقة", "تم"]);
  ok("client edits: free for 12h, then locked (423) → edit request → supervisor approves → applied; agent notified");

  console.log("ALL SESSION-4 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e.message); process.exit(1); });
`);
