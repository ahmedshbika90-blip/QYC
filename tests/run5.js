// Session 5: invoice-level discount everywhere money is counted, goods
// received waiting in الطلبات, Arabic-digit phones, SDG formatting.
const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const SUP = { role: "supervisor", uid: "sup" };
  const { netLines } = require(path.join(ROOT, "lib/invoiceDiscount"));
  const { formatNumber } = require(path.join(ROOT, "lib/labels"));
  const { normalizePhone } = require(path.join(ROOT, "lib/validation"));

  await db.collection("products").doc("a").set({ name: "A", unit: "ctn", active: true, prices: { car1: 100, car2: 100 }, avgCost: 60, stock: { depot: 100, car1: 50, car2: 0, damaged: 0 } });
  await db.collection("products").doc("b").set({ name: "B", unit: "ctn", active: true, prices: { car1: 50, car2: 50 }, avgCost: 20, stock: { depot: 100, car1: 50, car2: 0, damaged: 0 } });
  await db.collection("clients").doc("4000").set({ name: "C", storeName: "S", location: "L", route: "car1", phone: "0900000000", whatsapp: "0900000000", storeClass: "A", active: true, createdAt: new Date().toISOString() });

  // 1. Discount spread exactly across lines for per-product figures.
  const spread = netLines({ discount: 10, items: [{ subtotal: 100 }, { subtotal: 50 }, { subtotal: 50 }] });
  assert.deepStrictEqual(spread.map((l) => l.netSubtotal), [95, 47.5, 47.5]);
  const odd = netLines({ discount: 10, items: [{ subtotal: 1 }, { subtotal: 1 }, { subtotal: 1 }] });
  assert.strictEqual(Math.round(odd.reduce((s, l) => s + l.discountShare, 0) * 100) / 100, 10);
  assert.strictEqual(formatNumber(12500), "\\u206612,500.00 SDG\\u2069");
  assert.strictEqual(normalizePhone("٠٩١٢٣٤٥٦٧٨"), "0912345678");
  assert.strictEqual(normalizePhone("۰۹۱ ۲۳۴-۵۶۷۸"), "0912345678");
  ok("discount spread adds up exactly; amounts show as '12,500.00 SDG'; Arabic/Persian digits → English phone");

  // 2. Invoice with a discount: 2×100 + 2×50 = 300 − 30 = 270.
  const ord = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "4000", items: [{ productId: "a", qty: 2 }, { productId: "b", qty: 2 }], discount: "٣٠", requestId: "req-disc-order-01" } });
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  assert.deepStrictEqual([ord.json.subtotal, ord.json.discount, ord.json.total], [300, 30, 270]); // Arabic digits accepted

  // Sales report: client total after discount.
  const sales = await call("pages/api/reports/sales.js", { ...A1, query: {} });
  const row = sales.json.clients.find((c) => c.clientId === "4000");
  assert.deepStrictEqual([row.grossPrice, row.discount, row.totalPrice], [300, 30, 270]);
  assert.strictEqual(sales.json.grandTotalPrice, 270);

  // Margin: revenue after discount (270), cost 2×60 + 2×20 = 160 → 110.
  await db.collection("orders").doc("req-disc-order-01").update({ lockedAt: new Date().toISOString() });
  const margin = await call("pages/api/reports/margin.js", { ...SUP, query: { from: new Date(Date.now() - 86400000).toISOString() } });
  assert.strictEqual(margin.status, 200, JSON.stringify(margin.json));
  assert.deepStrictEqual([margin.json.totals.revenue, margin.json.totals.cost, margin.json.totals.margin, margin.json.totals.discount], [270, 160, 110, 30]);
  const pa = margin.json.products.find((p) => p.productId === "a");
  assert.strictEqual(pa.revenue, 180); // 200 − its 2/3 share of the 30 discount
  ok("invoice discount 300 − 30 = 270 counted in the sales report and the margin (revenue 270, margin 110)");

  // 3. Editing keeps the discount unless changed, and can't drop below it.
  const ord2 = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: "4000", items: [{ productId: "a", qty: 3 }], discount: 50, requestId: "req-disc-order-02" } });
  assert.strictEqual(ord2.json.total, 250);
  const keep = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-disc-order-02" }, body: { items: [{ productId: "a", qty: 4 }] } });
  assert.strictEqual(keep.status, 200, JSON.stringify(keep.json));
  assert.strictEqual(keep.json.total, 350); // 400 − the same 50
  const tooSmall = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-disc-order-02" }, body: { items: [{ productId: "b", qty: 0.5 }] } });
  assert.strictEqual(tooSmall.status, 400); // 25 < 50 discount
  const changed = await call("pages/api/orders/[id]/items.js", { method: "PATCH", ...A1, query: { id: "req-disc-order-02" }, body: { items: [{ productId: "a", qty: 4 }], discount: 0 } });
  assert.strictEqual(changed.json.total, 400);
  const saved = await get("orders", "req-disc-order-02");
  assert.deepStrictEqual([saved.subtotal, saved.discount, saved.total], [400, 0, 400]);
  assert.strictEqual(saved.editHistory[saved.editHistory.length - 1].discount, 50); // history keeps the old discount
  ok("editing keeps the discount (400 − 50), refuses lines below it, and removing it is recorded in the history");

  // 4. Locked invoice: the discount travels with the change request.
  await db.collection("orders").doc("req-disc-order-02").update({ lockedAt: new Date().toISOString() });
  const cr = await call("pages/api/requests/create.js", { method: "POST", ...A1, body: { orderId: "req-disc-order-02", type: "edit", items: [{ productId: "a", qty: 4 }], discount: 40, reason: "خصم متفق عليه", requestId: "req-disc-change-01" } });
  assert.strictEqual(cr.status, 201, JSON.stringify(cr.json));
  const crDoc = await get("changeRequests", "req-disc-change-01");
  assert.deepStrictEqual([crDoc.proposedDiscount, crDoc.proposedTotal, crDoc.currentDiscount], [40, 360, 0]);
  await call("pages/api/requests/[id]/decide.js", { method: "PATCH", ...SUP, query: { id: "req-disc-change-01" }, body: { action: "approve" } });
  assert.strictEqual((await get("orders", "req-disc-order-02")).total, 360);
  ok("locked invoice: discount change goes through the supervisor and is applied on approval (400 − 40)");

  // 5. Goods received: waits in الطلبات, stock only after approval.
  const rcv = await call("pages/api/inventory/received.js", { method: "POST", ...WK, body: { items: [{ productId: "a", qty: 10 }], requestId: "req-rcv-000000001" } });
  assert.strictEqual(rcv.status, 201, JSON.stringify(rcv.json));
  const depotBefore = (await get("products", "a")).stock.depot;
  const supItems = (await call("pages/api/notifications.js", SUP)).json.items;
  const rcvItem = supItems.find((it) => it.id === rcv.json.id);
  assert.deepStrictEqual([rcvItem.bucket, rcvItem.needsAction], ["modification", true]); // → الطلبات dot
  const supHistory = await call("pages/api/inventory/list.js", { ...SUP, query: { excludePending: "1" } });
  assert.ok(!supHistory.json.docs.some((d) => d.id === rcv.json.id)); // not in المخزون history yet
  await call("pages/api/inventory/[id]/approve.js", { method: "PATCH", ...SUP, query: { id: rcv.json.id }, body: { action: "approve", costPrices: { a: 70 } } });
  assert.strictEqual((await get("products", "a")).stock.depot, depotBefore + 10);
  const supHistory2 = await call("pages/api/inventory/list.js", { ...SUP, query: { excludePending: "1" } });
  assert.ok(supHistory2.json.docs.some((d) => d.id === rcv.json.id)); // now in المخزون
  ok("goods received: pending in الطلبات (dot), stock and المخزون history only after the supervisor approves");

  // 6. Phones typed on an Arabic keyboard are stored in English digits.
  const reg = await call("pages/api/clients/register.js", { method: "POST", ...A1, body: { nameFirst: "أ", nameMiddle: "ب", nameLast: "ج", storeName: "S", location: "L", phone: "٠٩١٢٣٤٥٦٧٨", storeClass: "B", requestId: "req-reg-arabic-01" } });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.json));
  const c = await get("clients", reg.json.clientId);
  assert.deepStrictEqual([c.phone, c.whatsapp], ["0912345678", "0912345678"]);
  const edit = await call("pages/api/clients/[id]/index.js", { method: "PATCH", ...A1, query: { id: reg.json.clientId }, body: { phone: "٠٩٩٩٨٨٨٧٧٧" } });
  assert.strictEqual(edit.status, 200, JSON.stringify(edit.json));
  assert.strictEqual((await get("clients", reg.json.clientId)).phone, "0999888777");
  ok("phone typed in Arabic digits is accepted and saved as 0912345678 (register and edit)");

  console.log("ALL SESSION-5 SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e.message); process.exit(1); });
`);
