// Demo data: the generated data set loads into the app's own APIs without
// errors and produces sensible dashboards, accounting and stock views.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, headers: { authorization: t } }, res);
  return { status, json };
};
const { generate } = require("../scripts/demo/generate");

(async () => {
  const d = generate({ months: 3, seed: 7 });
  const again = generate({ months: 3, seed: 7 });
  assert.strictEqual(JSON.stringify(d.orders.slice(0, 5)), JSON.stringify(again.orders.slice(0, 5)));
  for (const [coll, list] of [["products", d.products], ["clients", d.clients], ["orders", d.orders], ["inventoryDocs", d.inventoryDocs], ["invoicePayments", d.invoicePayments], ["paymentRefs", d.paymentRefs]]) {
    for (const { id, data } of list) await db.collection(coll).doc(id).set(data);
  }
  ok("generator is repeatable (same seed → same data) and loads " + d.orders.length + " invoices");

  // money and stock consistency
  for (const o of d.orders) {
    const sub = o.data.items.reduce((s, l) => s + l.subtotal, 0);
    assert.strictEqual(o.data.subtotal, sub);
    assert.strictEqual(o.data.total, sub - o.data.discount);
    assert.ok(o.data.discount >= 0 && o.data.discount < sub);
  }
  for (const p of d.invoicePayments) {
    const o = d.orders.find((x) => x.id === p.id).data;
    assert.ok(p.data.paidTotal <= o.total, "overpaid " + p.id);
    assert.ok(p.data.payments.every((x) => /^\\d{1,11}$/.test(x.ref)));
  }
  assert.ok(d.products.every((p) => Object.values(p.data.stock).every((v) => v >= 0)));
  assert.ok(d.orders.every((o) => o.data.createdAt <= new Date().toISOString()));
  ok("totals add up, no overpayment, valid references, no negative stock, nothing in the future");

  const from = d.period.from, to = d.period.to;
  const ex = await call("pages/api/executive/overview.js", { role: "executive", uid: "e", query: { from, to } });
  assert.strictEqual(ex.status, 200, JSON.stringify(ex.json));
  assert.ok(ex.json.totals.units > 500 && ex.json.wholesale.units > 0 && ex.json.retail.units > 0);
  assert.ok(ex.json.groups.find((g) => g.id === "alwafi").units > 0 && ex.json.groups.find((g) => g.id === "snacks").units > 0);
  assert.strictEqual(ex.json.totals.uncostedUnits, 0);
  const cu = await call("pages/api/executive/customers.js", { role: "executive", uid: "e", query: { from, to } });
  assert.strictEqual(cu.json.top.length, 10);
  assert.ok(cu.json.top[0].share > cu.json.top[9].share);
  const tr = await call("pages/api/dashboard/trend.js", { role: "manager", uid: "m", query: { bucket: "week" } });
  assert.strictEqual(tr.status, 200);
  const td = await call("pages/api/dashboard/trend.js", { role: "executive", uid: "e", query: { bucket: "day" } });
  assert.strictEqual(td.json.buckets.length, 30);
  const fridays = td.json.buckets.filter((b) => new Date(new Date(b.from).getTime() + 2 * 3600e3).getUTCDay() === 5);
  assert.strictEqual(fridays.length, 0); // daily chart skips Fridays
  const sm = await call("pages/api/dashboard/summary.js", { role: "manager", uid: "m", query: { from, to } });
  assert.strictEqual(sm.status, 200, JSON.stringify(sm.json));
  const rc = await call("pages/api/executive/stock.js", { role: "executive", uid: "e", query: { view: "received", from } });
  assert.ok(rc.json.docs.length >= 10);
  ok("executive overview, customers, receipts, manager summary and trend all work on demo data");

  const acc = await call("pages/api/accounting/invoices.js", { role: "accountant", uid: "a", query: { from } });
  const statuses = new Set(acc.json.invoices.map((i) => i.payment.status));
  assert.ok(statuses.has("paid") && statuses.has("unpaid"));
  const someRef = d.paymentRefs[0].data.ref;
  const fr = await call("pages/api/accounting/find-ref.js", { role: "accountant", uid: "a", query: { ref: someRef.slice(0, 4) } });
  assert.ok(fr.json.matches.some((m) => m.ref === someRef));
  ok("accountant sees paid / partial / unpaid invoices and can find a demo payment by its first digits");

  // 5. the real seeding script, with the company's OWN products
  for (const name of Object.keys(db._data)) delete db._data[name];
  const mine = [
    { id: "p-real-1", name: "طحنية الوافي 400 جرام", unit: "كرتونة", category: "طحنية", prices: { car1: 61000, car2: 64500 }, avgCost: 52000, stock: { depot: 300, car1: 40, car2: 25, damaged: 0 }, active: true },
    { id: "p-real-2", name: "شبس شيبسيانو كبير", unit: "كرتونة", category: "شبس", prices: { car1: 27000, car2: 29000 }, avgCost: 22000, stock: { depot: 500, car1: 60, car2: 30, damaged: 0 }, active: true },
    { id: "p-real-3", name: "منتج بدون سعر تجزئة", unit: "بكت", category: "طحينة", prices: { car1: 10000 }, avgCost: 8000, stock: { depot: 10 }, active: true },
    { id: "demo-old-sample", name: "منتج تجريبي قديم", unit: "كرتونة", category: "شبس", prices: { car1: 1, car2: 1 }, demo: true, active: true },
  ];
  for (const p of mine) { const { id, ...data } = p; await db.collection("products").doc(id).set(data); }
  await db.collection("orders").doc("old-real-invoice").set({ route: "car1", clientId: "1", total: 5, items: [], createdAt: "2025-01-01T00:00:00Z" });
  const fb = require.cache[fbPath].exports;
  fb.adminAuth.listUsers = async () => ({ users: [{ uid: "u-c2", email: "a@x", customClaims: { role: "agent_car2" } }] });
  fb.adminDb.recursiveDelete = async (coll) => { delete db._data[coll._name || coll.id]; };
  fb.adminDb.bulkWriter = () => { const ops = []; return { set: (r, v, o) => ops.push(() => r.set(v, o)), update: (r, v) => ops.push(() => r.update(v)), async close() { for (const o of ops) await o(); } }; };
  process.env.FIREBASE_PROJECT_ID = "demo-proj";
  const log = console.log; const lines = []; console.log = (...a) => lines.push(a.join(" "));
  const { main } = require("../scripts/demo/seed.js");
  await main(["--months=2"]); // dry run
  const afterDry = Object.keys(db._data.orders || {});
  await main(["--run", "--confirm=demo-proj", "--months=2"]);
  console.log = log;
  assert.deepStrictEqual(afterDry, ["old-real-invoice"]); // dry run changed nothing
  assert.ok(!db._data.orders["old-real-invoice"]); // old invoices wiped
  const prods = db._data.products;
  assert.ok(!prods["demo-old-sample"]); // earlier sample product removed
  assert.deepStrictEqual(prods["p-real-1"].prices, { car1: 61000, car2: 64500 }); // untouched
  assert.deepStrictEqual(prods["p-real-1"].stock, { depot: 300, car1: 40, car2: 25, damaged: 0 }); // untouched without --reset-stock
  const lines2 = Object.values(db._data.orders).flatMap((o) => o.items);
  assert.ok(lines2.length > 100);
  assert.ok(lines2.every((l) => ["p-real-1", "p-real-2"].includes(l.productId))); // only real, fully priced products
  const l1 = lines2.find((l) => l.productId === "p-real-1" && !l.freeSample);
  assert.ok([61000, 64500].includes(l1.price) && l1.unitCost === 52000);
  assert.ok(lines.some((t) => t.includes("منتج بدون سعر تجزئة"))); // reported as skipped
  console.log = () => {};
  await main(["--run", "--confirm=demo-proj", "--months=2", "--reset-stock"]);
  console.log = log;
  assert.notDeepStrictEqual(db._data.products["p-real-1"].stock, { depot: 300, car1: 40, car2: 25, damaged: 0 });
  assert.deepStrictEqual(db._data.products["p-real-1"].prices, { car1: 61000, car2: 64500 });
  ok("seeding uses the company's own products, prices and costs; leaves them (and stock) untouched; dry run changes nothing");

  console.log("ALL DEMO-DATA SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
