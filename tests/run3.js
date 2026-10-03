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
  const SUPV = { role: "supervisor", uid: "sup" };
  const dmg1 = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "p1", qty: 5 }], requestId: "req-dmg-00000001" } });
  assert.strictEqual(dmg1.status, 201, JSON.stringify(dmg1.json));
  assert.strictEqual(dmg1.json.status, "pending");
  const dmg2 = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "p1", qty: 5 }], requestId: "req-dmg-00000001" } });
  assert.ok(dmg2.json.duplicate);
  const beforeApproval = (await get("products", "p1")).stock;
  assert.deepStrictEqual([beforeApproval.depot, beforeApproval.damaged], [100, 0]); // nothing moves yet
  const supNotif = (await call("pages/api/notifications.js", SUPV)).json.items.find((it) => it.id === dmg1.json.id);
  assert.deepStrictEqual([supNotif.needsAction, supNotif.requestType, supNotif.bucket], [true, "تسجيل تالف", "modification"]);
  const ap1 = await call("pages/api/inventory/[id]/approve.js", { method: "PATCH", ...SUPV, query: { id: dmg1.json.id }, body: { action: "approve" } });
  assert.strictEqual(ap1.status, 200, JSON.stringify(ap1.json));
  await call("pages/api/inventory/[id]/approve.js", { method: "PATCH", ...SUPV, query: { id: dmg1.json.id }, body: { action: "approve" } });
  const afterDmg = (await get("products", "p1")).stock;
  assert.deepStrictEqual([afterDmg.depot, afterDmg.damaged], [95, 5]); // moved once, on approval
  const wkInfo = (await call("pages/api/notifications.js", WK)).json.items.find((it) => it.id === dmg1.json.id);
  assert.deepStrictEqual([wkInfo.needsAction, wkInfo.state], [false, "تم الاعتماد"]);
  const tooMuch = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "p1", qty: 9999 }], requestId: "req-dmg-00000002" } });
  assert.strictEqual(tooMuch.status, 400);
  ok("damage: keeper's record waits for the supervisor (stock untouched), approval moves depot 100→95 once, keeper notified");

  // 2. A free-sample line is accepted: it costs the client nothing but the
  // goods still leave the car, so stock moves by the full quantity. A
  // per-LINE discount is still refused — discounts are ONE amount off the
  // whole invoice, computed server-side.
  await db.collection("clients").doc("2000").set({ name: "C", storeName: "S", location: "L", route: "car1", phone: "0900000000", whatsapp: "0900000000", storeClass: "A", active: true });
  const sample = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "2000", items: [{ productId: "p1", qty: 1, freeSample: true }], requestId: "req-freesample-00" } });
  assert.strictEqual(sample.status, 201, JSON.stringify(sample.json));
  assert.deepStrictEqual([sample.json.subtotal, sample.json.discount, sample.json.total], [0, 0, 0]); // free: no charge
  const sampleDoc = await get("orders", "req-freesample-00");
  assert.strictEqual(sampleDoc.items[0].freeSample, true);
  assert.strictEqual(sampleDoc.items[0].subtotal, 0);
  const lineDisc = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "2000", items: [{ productId: "p1", qty: 2, discount: 5 }], requestId: "req-linedisc-00" } });
  assert.strictEqual(lineDisc.status, 400);
  const tooBig = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "2000", items: [{ productId: "p1", qty: 5 }], discount: 51, requestId: "req-bigdisc-000" } });
  assert.strictEqual(tooBig.status, 400); // discount above the invoice
  const ord = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: {
    clientId: "2000",
    items: [{ productId: "p1", qty: 5 }],
    discount: 5,
    notes: "التسليم بعد العصر",
    requestId: "req-freesample-01",
  }});
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  assert.deepStrictEqual([ord.json.subtotal, ord.json.discount, ord.json.total], [50, 5, 45]);
  assert.strictEqual((await get("orders", "req-freesample-01")).notes, "التسليم بعد العصر"); // note saved at creation
  const afterSale = (await get("products", "p1")).stock;
  assert.strictEqual(afterSale.car1, 4); // 1 free sample + 5 sold: full quantity moved for both
  ok("free sample accepted at zero charge (stock moves); per-line discount refused; invoice discount 50 − 5 = 45; note saved with the new invoice");

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
  // One open request per agent: car1 still has reqCar1 (scenario 3) open,
  // so a second request is refused until the keeper closes that one.
  const blockedSecond = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A1, body: { type: "offloading", items: [{ productId: "p1", qty: 2 }], requestId: "req-shipoff-car1-00" } });
  assert.strictEqual(blockedSecond.status, 409, JSON.stringify(blockedSecond.json));
  assert.strictEqual(blockedSecond.json.openRequestId, reqCar1.json.id);
  // Keeper cancels it — a note is required, and nothing moves.
  const stockBeforeCancel = (await get("products", "p1")).stock;
  const cancelNoNote = await call("pages/api/shipment-requests/[id]/cancel.js", { method: "PATCH", ...WK, query: { id: reqCar1.json.id }, body: { note: "  " } });
  assert.strictEqual(cancelNoNote.status, 400);
  const cancelByAgent = await call("pages/api/shipment-requests/[id]/cancel.js", { method: "PATCH", ...A1, query: { id: reqCar1.json.id }, body: { note: "x" } });
  assert.strictEqual(cancelByAgent.status, 403);
  const cancelled = await call("pages/api/shipment-requests/[id]/cancel.js", { method: "PATCH", ...WK, query: { id: reqCar1.json.id }, body: { note: "الكمية غير متوفرة اليوم" } });
  assert.strictEqual(cancelled.status, 200, JSON.stringify(cancelled.json));
  const cancelledAgain = await call("pages/api/shipment-requests/[id]/cancel.js", { method: "PATCH", ...WK, query: { id: reqCar1.json.id }, body: { note: "الكمية غير متوفرة اليوم" } });
  assert.ok(cancelledAgain.json.duplicate); // double tap is a no-op
  const fulfillCancelled = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: reqCar1.json.id }, body: { requestId: "req-fulfill-cancelled" } });
  assert.strictEqual(fulfillCancelled.status, 400); // can't execute a cancelled request
  assert.deepStrictEqual((await get("products", "p1")).stock, stockBeforeCancel);
  assert.strictEqual((await get("shipmentRequests", reqCar1.json.id)).cancelNote, "الكمية غير متوفرة اليوم");
  ok("one open request per agent; keeper cancels with a required note, nothing moves, cancelled can't be executed");

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
    [93, 2, 4] // depot 89+2+2, car1 4-2 (1 unit went out as a free sample earlier), car2 6-2 — both offloads moved stock immediately
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

  // 7. /api/notifications.js: per-role, per-item feed — what it is, who
  // it's from, its state, and where it leads. Checking specific items by
  // id (rather than exact totals) since a lot of state has accumulated
  // across the scenarios above.
  const supNotifs = (await call("pages/api/notifications.js", SUP)).json.items;
  const supItem = supNotifs.find((it) => it.id === "req-detail-doc-000001");
  assert.ok(supItem, "supervisor should see the pending change request");
  assert.deepStrictEqual(
    [supItem.bucket, supItem.needsAction, supItem.state, supItem.href],
    ["modification", true, "بانتظار قرارك", "/requests/req-detail-doc-000001"]
  );

  const wkNotifs1 = (await call("pages/api/notifications.js", WK)).json.items;
  assert.ok(!wkNotifs1.some((it) => it.id === reqCar1.json.id)); // cancelled → no longer the keeper's work
  const wkCountBefore = wkNotifs1.filter((it) => it.needsAction).length;
  const freshOff = await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "offloading", items: [{ productId: "p1", qty: 1 }], requestId: "req-actioncount-off01" } });
  assert.strictEqual(freshOff.status, 201, JSON.stringify(freshOff.json));
  const wkNotifs2 = (await call("pages/api/notifications.js", WK)).json.items;
  assert.strictEqual(wkNotifs2.filter((it) => it.needsAction).length, wkCountBefore + 1);
  const wkItem = wkNotifs2.find((it) => it.id === freshOff.json.id);
  assert.deepStrictEqual(
    [wkItem.bucket, wkItem.needsAction, wkItem.requestType, wkItem.route, wkItem.href],
    ["shipping", true, "مرتجع بضاعة", "car2", "/shipping/" + freshOff.json.id]
  );
  // close it so car2 may send its next request
  const freshOffDone = await call("pages/api/shipment-requests/[id]/fulfill.js", { method: "PATCH", ...WK, query: { id: freshOff.json.id }, body: { requestId: "req-actioncount-offdoc" } });
  assert.strictEqual(freshOffDone.status, 201, JSON.stringify(freshOffDone.json));

  await call("pages/api/shipment-requests/create.js", { method: "POST", ...A2, body: { type: "loading", items: [{ productId: "p1", qty: 1 }], requestId: "req-actioncount-load01" } });
  const car1Notifs = (await call("pages/api/notifications.js", A1)).json.items;
  const todecideItems = car1Notifs.filter((it) => it.bucket === "shipping" && it.needsAction && it.from === "مبيعات تجزئة");
  assert.strictEqual(todecideItems.length, 1); // the fresh car2 loading request — the offloading one never gates through car1
  // car1's OWN offloading from scenario 5, already fulfilled, shows up as
  // a one-time informational item (needsAction: false).
  const car1OwnResolved = car1Notifs.find((it) => it.id === offCar1Req.json.id);
  assert.ok(car1OwnResolved);
  assert.deepStrictEqual(
    [car1OwnResolved.bucket, car1OwnResolved.needsAction, car1OwnResolved.requestType, car1OwnResolved.state],
    ["shipping", false, "مرتجع بضاعة", "تم التنفيذ"]
  );
  const car1Cancelled = car1Notifs.find((it) => it.id === reqCar1.json.id);
  assert.deepStrictEqual(
    [car1Cancelled.needsAction, car1Cancelled.state, car1Cancelled.note],
    [false, "تم الإلغاء", "الكمية غير متوفرة اليوم"]
  ); // the agent is told, with the keeper's note
  ok("notifications: supervisor/warehouse-keeper/car1 each see the right pending items; a resolved item is informational (needsAction: false)");

  // 8. GET /api/shipment-requests/[id]/index.js — powers the /shipping/[id]
  // detail page: the requester, car1 (oversight on car2), the warehouse
  // keeper and the supervisor can all read it; an unrelated agent cannot.
  const shipRead = await call("pages/api/shipment-requests/[id]/index.js", { ...A2, query: { id: reqCar1.json.id } });
  assert.strictEqual(shipRead.status, 403); // car2 has no relation to car1's own request
  const shipReadOwner = await call("pages/api/shipment-requests/[id]/index.js", { ...A1, query: { id: reqCar1.json.id } });
  assert.strictEqual(shipReadOwner.status, 200, JSON.stringify(shipReadOwner.json));
  const shipReadWk = await call("pages/api/shipment-requests/[id]/index.js", { ...WK, query: { id: reqCar1.json.id } });
  assert.strictEqual(shipReadWk.status, 200);
  const shipReadSup = await call("pages/api/shipment-requests/[id]/index.js", { ...SUP, query: { id: reqCar1.json.id } });
  assert.strictEqual(shipReadSup.status, 200);
  ok("shipment request detail: owner, warehouse keeper and supervisor can read it; an unrelated agent is refused");

  // 7. Visibility and margin rules.
  // a) The retail agent never receives the wholesale van's stock — removed
  //    on the server, so it can't be read from the response either.
  const plCar2 = await call("pages/api/products/list.js", { ...A2 });
  assert.strictEqual(plCar2.status, 200);
  assert.ok(plCar2.json.products.every((p) => !p.stock || !("car1" in p.stock)), "car2 must not receive car1 stock");
  const plCar1 = await call("pages/api/products/list.js", { ...A1 });
  assert.ok(plCar1.json.products.some((p) => p.stock && "car1" in p.stock && "car2" in p.stock)); // car1 sees both vans
  // b) The warehouse keeper gets no prices at all, and can't open the sales
  //    report (which now carries the operating margin).
  const plWk = await call("pages/api/products/list.js", { ...WK });
  assert.ok(plWk.json.products.every((p) => p.prices === undefined && p.price === undefined && p.avgCost === undefined));
  const repWk = await call("pages/api/reports/sales.js", { ...WK, query: {} });
  assert.strictEqual(repWk.status, 403);
  // c) Agents get the margin of the report's CURRENT invoices (not only
  //    finalized ones), as totals only — never a cost figure.
  await db.collection("products").doc("p1").update({ avgCost: 6 });
  const repA1 = await call("pages/api/reports/sales.js", { ...A1, query: {} });
  assert.strictEqual(repA1.status, 200, JSON.stringify(repA1.json));
  const mg = repA1.json.margin;
  assert.ok(mg && typeof mg.margin === "number" && typeof mg.revenue === "number");
  assert.strictEqual(mg.invoiceCount, repA1.json.orderCount); // exactly the report's invoices
  assert.ok(mg.marginPct !== null); // cost known -> percentage computed
  assert.ok(!("cost" in mg)); // totals only
  ok("visibility: car2 never receives car1 stock; keeper gets no prices and no sales report; agents get margin of the report's current invoices (totals only)");

  console.log("ALL SESSION-3 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
