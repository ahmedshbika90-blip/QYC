// Session 7: price adjustment on one invoice line ("سعر معدّل") — above
// the list price only, reason required, kept through edits and change
// requests, refused on public orders, counted in revenue and margin.
const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  const SUP = { role: "supervisor", uid: "sup" };
  const { presentOrder } = require(path.join(ROOT, "lib/invoiceLock"));
  const { cartLineTotal, priceProblem, cartLineFromOrderLine } = require(path.join(ROOT, "lib/linePrice"));

  await db.collection("clients").doc("5000").set({ name: "C", storeName: "S", location: "L", route: "car1", phone: "0900000000", whatsapp: "0900000000", storeClass: "A", active: true, createdAt: new Date().toISOString() });
  await db.collection("products").doc("t").set({ name: "Tahnia", unit: "جردل", category: "طحنية", active: true, prices: { car1: 100, car2: 110 }, avgCost: 60, stock: { depot: 100, car1: 50, car2: 0, damaged: 0 } });
  await db.collection("products").doc("c").set({ name: "Chips", unit: "كرتونة", category: "شبس", active: true, prices: { car1: 40, car2: 45 }, avgCost: 30, stock: { depot: 100, car1: 50, car2: 0, damaged: 0 } });
  const create = (items, rid) => call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "5000", items, requestId: rid } });

  // 1. Client-side helpers agree with the server.
  const line = { productId: "t", qty: 2, listPrice: 100, priceAdjusted: true, customPrice: "١٢٠", priceReason: "" };
  assert.strictEqual(cartLineTotal(line), 240);
  assert.ok(priceProblem(line).includes("سبب"));
  assert.ok(priceProblem({ ...line, customPrice: "90", priceReason: "x" }).includes("خصم"));
  assert.strictEqual(priceProblem({ ...line, priceReason: "ترحيل" }), "");
  ok("cart helpers: ١٢٠ × 2 = 240; reason required; lower than list refused");

  // 2. Server refuses lower price and missing reason.
  assert.strictEqual((await create([{ productId: "t", qty: 1, customPrice: "90", priceReason: "x" }], "req-adj-low-00001")).status, 400);
  assert.strictEqual((await create([{ productId: "t", qty: 1, customPrice: "120" }], "req-adj-noreason1")).status, 400);
  ok("price below list refused (use the discount); higher price without reason refused");

  // 3. Valid adjustment on one line; the other line stays at list price.
  const o = await create([{ productId: "t", qty: 2, customPrice: "١٢٠٫٥", priceReason: "ترحيل لمنطقة بعيدة" }, { productId: "c", qty: 1 }], "req-adj-order-001");
  assert.strictEqual(o.status, 201, JSON.stringify(o.json));
  let saved = await get("orders", "req-adj-order-001");
  const tl = saved.items.find((it) => it.productId === "t");
  const cl = saved.items.find((it) => it.productId === "c");
  assert.deepStrictEqual([tl.price, tl.listPrice, tl.priceAdjusted, tl.priceReason, tl.subtotal], [120.5, 100, true, "ترحيل لمنطقة بعيدة", 241]);
  assert.deepStrictEqual([cl.price, cl.priceAdjusted, cl.subtotal], [40, undefined, 40]);
  assert.strictEqual(saved.total, 281);
  assert.strictEqual((await get("products", "t")).prices.car1, 100); // catalog unchanged
  assert.strictEqual(presentOrder("x", saved, "agent_car1").hasPriceAdjustment, true);
  ok("adjusted line saved at 120.5 (list 100, reason kept), other line at list; total 281; catalog price unchanged; invoice flagged");

  // 4. Edit after a catalog price rise: the adjusted line keeps its price
  // and its original list price; changing only the quantity works.
  await db.collection("products").doc("t").update({ "prices.car1": 130 });
  const editItems = saved.items.map(cartLineFromOrderLine).map((it) => ({ productId: it.productId, qty: it.productId === "t" ? 3 : it.qty, freeSample: false, ...(it.priceAdjusted ? { customPrice: it.customPrice, priceReason: it.priceReason } : {}) }));
  const ed = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-adj-order-001" }, body: { items: editItems } });
  assert.strictEqual(ed.status, 200, JSON.stringify(ed.json));
  saved = await get("orders", "req-adj-order-001");
  const tl2 = saved.items.find((it) => it.productId === "t");
  assert.deepStrictEqual([tl2.qty, tl2.price, tl2.listPrice, tl2.subtotal], [3, 120.5, 100, 361.5]);
  ok("edit after catalog rise: adjusted line keeps 120.5 against its original list 100; qty 2 → 3");

  // 5. A price-only change counts as an edit (recorded in history).
  const before = saved.editHistory.length;
  const ed2 = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-adj-order-001" }, body: { items: [{ productId: "t", qty: 3, customPrice: "125", priceReason: "ترحيل" }, { productId: "c", qty: 1 }] } });
  assert.strictEqual(ed2.status, 200, JSON.stringify(ed2.json));
  saved = await get("orders", "req-adj-order-001");
  assert.strictEqual(saved.editHistory.length, before + 1);
  assert.strictEqual(saved.items.find((it) => it.productId === "t").price, 125);
  ok("changing only the price is saved as an edit and kept in the history");

  // 6. Locked invoice: the adjustment travels with the change request and
  // is applied as proposed on approval (free sample too).
  await db.collection("orders").doc("req-adj-order-001").update({ lockedAt: new Date().toISOString() });
  const cr = await call("pages/api/requests/create.js", { method: "POST", ...A1, body: { orderId: "req-adj-order-001", type: "edit", items: [{ productId: "t", qty: 3, customPrice: "135", priceReason: "اتفاق جديد" }, { productId: "c", qty: 1, freeSample: true }], reason: "تعديل سعر", requestId: "req-adj-change-01" } });
  assert.strictEqual(cr.status, 201, JSON.stringify(cr.json));
  const dec = await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-adj-change-01" }, body: { action: "approve" } });
  assert.strictEqual(dec.status, 200, JSON.stringify(dec.json));
  saved = await get("orders", "req-adj-order-001");
  const tl3 = saved.items.find((it) => it.productId === "t");
  assert.deepStrictEqual([tl3.price, tl3.listPrice, tl3.priceReason], [135, 100, "اتفاق جديد"]);
  assert.strictEqual(saved.items.find((it) => it.productId === "c").freeSample, true);
  assert.strictEqual(saved.total, 405);
  ok("locked invoice: change request carries the new price 135 and the free sample; applied as proposed (total 405)");

  // 7. Public client orders can't adjust prices.
  const pub = await call("pages/api/orders/create.js", { method: "POST", body: { clientId: "5000", items: [{ productId: "c", qty: 1, customPrice: "999", priceReason: "x" }], requestId: "req-adj-public-01" } });
  assert.strictEqual(pub.status, 201, JSON.stringify(pub.json));
  assert.deepStrictEqual([pub.json.items[0].price, pub.json.items[0].priceAdjusted, pub.json.total], [40, undefined, 40]);
  ok("public client order: a price adjustment in the request is ignored — list price 40 charged");

  console.log("ALL SESSION-7 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e.message); process.exit(1); });
`);
