// Session 6: product form (fixed type/unit lists, required unit cost,
// Arabic digits), whole-number quantities everywhere, latest supplier
// cost applied to all stock while sold invoices keep their cost.
const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const SUP = { role: "supervisor", uid: "sup" };

  // 1. Product create: lists, required cost, Arabic digits, whole stock.
  const base = { name: " طحنية سادة ", category: "طحنية", unit: "جردل", priceCar1: "١٢٠٠٫٥", priceCar2: "1300", avgCost: "٩٠٠", openingStock: "٤٠" };
  const noCost = await call("pages/api/products/create.js", { method: "POST", ...SUP, body: { ...base, avgCost: "", requestId: "req-prod-nocost-01" } });
  assert.strictEqual(noCost.status, 400);
  const badUnit = await call("pages/api/products/create.js", { method: "POST", ...SUP, body: { ...base, unit: "كيلو", requestId: "req-prod-badunit-1" } });
  assert.strictEqual(badUnit.status, 400);
  const badType = await call("pages/api/products/create.js", { method: "POST", ...SUP, body: { ...base, category: "حلويات", requestId: "req-prod-badtype-1" } });
  assert.strictEqual(badType.status, 400);
  const fracStock = await call("pages/api/products/create.js", { method: "POST", ...SUP, body: { ...base, openingStock: "2.5", requestId: "req-prod-frac-0001" } });
  assert.strictEqual(fracStock.status, 400);
  const made = await call("pages/api/products/create.js", { method: "POST", ...SUP, body: { ...base, requestId: "req-prod-good-0001" } });
  assert.strictEqual(made.status, 201, JSON.stringify(made.json));
  const p = await get("products", "req-prod-good-0001");
  assert.deepStrictEqual([p.name, p.prices.car1, p.prices.car2, p.avgCost, p.stock.depot], ["طحنية سادة", 1200.5, 1300, 900, 40]);
  ok("product create: type/unit from the lists, cost required, Arabic digits + ٫ saved as 1200.5 / 900 / 40, fractional stock refused");

  // 2. Product update: legacy free-text values must be replaced by list values.
  await db.collection("products").doc("old").set({ name: "Old", unit: "كرتون", category: "x", active: true, prices: { car1: 10, car2: 12 }, avgCost: 5, stock: { depot: 10, car1: 20, car2: 0, damaged: 0 } });
  const keepLegacy = await call("pages/api/products/[id]/update.js", { method: "PATCH", ...SUP, query: { id: "old" }, body: { unit: "كرتون" } });
  assert.strictEqual(keepLegacy.status, 400);
  const fracDepot = await call("pages/api/products/[id]/update.js", { method: "PATCH", ...SUP, query: { id: "old" }, body: { depotStock: "3.5" } });
  assert.strictEqual(fracDepot.status, 400);
  const fixed = await call("pages/api/products/[id]/update.js", { method: "PATCH", ...SUP, query: { id: "old" }, body: { unit: "كرتونة", category: "شبس", priceCar1: "١١٫٢٥" } });
  assert.strictEqual(fixed.status, 200, JSON.stringify(fixed.json));
  const old = await get("products", "old");
  assert.deepStrictEqual([old.unit, old.category, old.prices.car1], ["كرتونة", "شبس", 11.25]);
  ok("product edit: old free-text unit refused, list value accepted; fractional depot refused; ١١٫٢٥ → 11.25");

  // 3. Fractions refused in receiving, damage and transfers.
  const rcvFrac = await call("pages/api/inventory/received.js", { method: "POST", ...WK, body: { items: [{ productId: "old", qty: "1.5" }], requestId: "req-rcv-frac-00001" } });
  assert.strictEqual(rcvFrac.status, 400);
  const dmgFrac = await call("pages/api/inventory/damage.js", { method: "POST", ...WK, body: { source: "depot", items: [{ productId: "old", qty: 0.5 }], requestId: "req-dmg-frac-00001" } });
  assert.strictEqual(dmgFrac.status, 400);
  const trFrac = await call("pages/api/transfers/create.js", { method: "POST", ...SUP, body: { items: [{ productId: "old", qty: "2٫5" }], requestId: "req-tr-frac-000001" } });
  assert.strictEqual(trFrac.status, 400);
  ok("receiving, damaged goods and transfers refuse fractional quantities");

  // 4. Sell at cost 5, then a delivery at 7: all stock now costs 7, the
  // old invoice keeps 5 — even after it is edited. New sales use 7.
  await db.collection("clients").doc("3100").set({ name: "C", storeName: "S", location: "L", route: "car1", phone: "0900000000", whatsapp: "0900000000", storeClass: "A", active: true, createdAt: new Date().toISOString() });
  const o1 = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "3100", items: [{ productId: "old", qty: 2 }], requestId: "req-cost-order-001" } });
  assert.strictEqual(o1.status, 201, JSON.stringify(o1.json));
  assert.strictEqual((await get("orders", "req-cost-order-001")).items[0].unitCost, 5);

  await db.collection("inventoryDocs").doc("rcv-cost").set({ type: "received", route: null, status: "pending", items: [{ productId: "old", name: "Old", unit: "كرتونة", qty: 10, costPrice: null }], createdAt: new Date().toISOString() });
  const ap = await call("pages/api/inventory/[id]/approve.js", { method: "PATCH", ...SUP, query: { id: "rcv-cost" }, body: { action: "approve", costPrices: { old: "٧" } } });
  assert.strictEqual(ap.status, 200, JSON.stringify(ap.json));
  assert.strictEqual((await get("products", "old")).avgCost, 7);

  const ed = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-cost-order-001" }, body: { items: [{ productId: "old", qty: 3 }] } });
  assert.strictEqual(ed.status, 200, JSON.stringify(ed.json));
  assert.strictEqual((await get("orders", "req-cost-order-001")).items[0].unitCost, 5);

  const o2 = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "3100", items: [{ productId: "old", qty: 1 }], requestId: "req-cost-order-002" } });
  assert.strictEqual(o2.status, 201, JSON.stringify(o2.json));
  assert.strictEqual((await get("orders", "req-cost-order-002")).items[0].unitCost, 7);
  ok("delivery at ٧ → all stock costs 7; the earlier invoice keeps cost 5 (also after editing it); new invoice uses 7");

  console.log("ALL SESSION-6 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e.message); process.exit(1); });
`);
