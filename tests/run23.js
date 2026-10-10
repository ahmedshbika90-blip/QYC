// Damaged goods, write-offs, free samples, and margin deductions.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, ...claims } = {}) {
  const h = load(rel); let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, url: "/" + rel, headers: { authorization: t } }, res); return { status, json };
};
const { businessDay } = require("../lib/businessDay");
const K = { role: "warehouse_keeper", uid: "keep" };
const M = { role: "manager", uid: "mgr" };
const AC = { role: "accountant", uid: "acc" };
const W = { role: "agent_car1", uid: "abd", salesSupervisor: true };
const A = "pages/api/stock-adjustments.js";
const today = businessDay(new Date());
const stock = async (id = "p1") => (await db.collection("products").doc(id).get()).data().stock;
const rid = (n) => "req-p23-00000" + String(n).padStart(4, "0");

(async () => {
  await db.collection("meta").doc("statsState").set({ ready: true });
  await db.collection("products").doc("p1").set({ name: "طحنية", active: true, prices: { car1: 1000, car2: 1100 }, stock: { depot: 100, car1: 20, car2: 0, damaged: 10 }, avgCost: 600 });
  await db.collection("clients").doc("1000").set({ name: "عميل", route: "car1", active: true });

  // ---------- 1. damaged refund stays in the van; offload must take it first ----------
  const inv = await call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: "1000", items: [{ productId: "p1", qty: 5 }], requestId: rid(1) } });
  await call("pages/api/orders/[id]/refund.js", { ...W, method: "POST", query: { id: inv.json.orderId }, body: { requestId: rid(2), lines: [{ index: 0, qty: 2, damaged: true }] } });
  let s = await stock();
  assert.deepStrictEqual([s.car1, s.damaged_car1, s.damaged], [15, 2, 10]); // not sellable, not yet warehouse تالف
  const off = (items, n) => call("pages/api/shipment-requests/create.js", { ...W, method: "POST", body: { type: "offloading", items, requestId: rid(n) } });
  const r1 = await off([{ productId: "p1", qty: 3 }], 3);
  assert.strictEqual(r1.status, 409); assert.ok(/أفرغ التالف/.test(r1.json.error));
  const r2 = await off([{ productId: "p1", qty: 2, damaged: true }, { productId: "p1", qty: 3 }], 4);
  assert.strictEqual(r2.status, 201, JSON.stringify(r2.json));
  const f = await call("pages/api/shipment-requests/[id]/fulfill.js", { ...K, method: "PATCH", query: { id: rid(4) }, body: { requestId: "req-p23-fulfil-0001" } });
  assert.ok(f.status === 200 || f.status === 201, JSON.stringify(f.json));
  s = await stock();
  assert.deepStrictEqual([s.car1, s.damaged_car1, s.damaged, s.depot], [12, 0, 12, 103]); // damaged → warehouse تالف; rest → depot
  ok("damaged goods from a refund stay apart in the van; an offload must take them first; they become warehouse تالف");

  // ---------- 2. write-off of damaged goods: keeper asks, manager approves ----------
  assert.strictEqual((await call(A, { ...M, method: "POST", body: { kind: "writeoff", mode: "transfer", items: [{ productId: "p1", qty: 1 }], requestId: rid(5) } })).status, 403);
  assert.strictEqual((await call(A, { ...K, method: "POST", body: { kind: "writeoff", mode: "obsolete", items: [{ productId: "p1", qty: 99 }], requestId: rid(6) } })).status, 409); // more than تالف
  const w1 = await call(A, { ...K, method: "POST", body: { kind: "writeoff", mode: "transfer", items: [{ productId: "p1", qty: 2 }], requestId: rid(7) } });
  const w2 = await call(A, { ...K, method: "POST", body: { kind: "writeoff", mode: "obsolete", items: [{ productId: "p1", qty: 3 }], requestId: rid(8) } });
  assert.deepStrictEqual([w1.status, w2.status], [201, 201]);
  assert.strictEqual((await stock()).damaged, 12); // nothing moves until approved
  const nm = await call("pages/api/notifications.js", M);
  const wo = nm.json.items.filter((i) => i.href.startsWith("/stock-adjustments?tab=writeoff&focus="));
  assert.ok(wo.length >= 2 && wo.every((i) => i.bucket === "adjust" && i.tab === "writeoff")); // opens the exact section and request
  assert.strictEqual((await call(A, { ...K, method: "POST", body: { id: rid(7), action: "approve" } })).status, 403); // keeper can't approve his own
  const a1 = await call(A, { ...M, method: "POST", body: { id: rid(7), action: "approve" } });
  const a2 = await call(A, { ...M, method: "POST", body: { id: rid(8), action: "approve" } });
  assert.deepStrictEqual([a1.json.marginDeduction, a2.json.marginDeduction, a2.json.costTotal], [0, 1800, 1800]); // obsolete: 3 × cost 600
  assert.strictEqual((await stock()).damaged, 7);
  ok("damaged write-off: keeper requests (transfer or obsolete), manager approves; transfer leaves with no value, obsolete deducts its cost");

  // ---------- 3. free samples: manager asks, keeper executes ----------
  const fs1 = await call(A, { ...M, method: "POST", body: { kind: "freeSample", mode: "company", items: [{ productId: "p1", qty: 4 }], requestId: rid(9) } });
  const fs2 = await call(A, { ...M, method: "POST", body: { kind: "freeSample", mode: "supplier", items: [{ productId: "p1", qty: 1 }], requestId: rid(10) } });
  assert.deepStrictEqual([fs1.status, fs2.status], [201, 201]);
  const kn = (await call("pages/api/notifications.js", K)).json.items.filter((i) => i.tab === "freeSample");
  assert.ok(kn.length === 2 && kn.every((i) => i.requestType === "طلب عينات مجانية" && i.href.includes("tab=freeSample"))); // no supplier/company for the keeper
  assert.strictEqual((await call(A, { ...M, method: "POST", body: { id: rid(9), action: "approve" } })).status, 403); // the keeper executes
  const d0 = (await stock()).depot;
  const e1 = await call(A, { ...K, method: "POST", body: { id: rid(9), action: "approve" } });
  const e2 = await call(A, { ...K, method: "POST", body: { id: rid(10), action: "reject" } });
  assert.deepStrictEqual([e1.json.marginDeduction, e2.json.status, (await stock()).depot], [2400, "rejected", d0 - 4]);
  ok("free samples: manager requests (supplier or company), keeper executes; company-paid deducts cost, supplier-paid leaves with no value");

  // an agent's free sample: its cost shows as a deduction on the invoice date
  const smp = await call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: "1000", items: [{ productId: "p1", qty: 1 }, { productId: "p1", qty: 2, freeSample: true }], requestId: rid(30) } });
  assert.strictEqual(smp.status, 201, JSON.stringify(smp.json));

  // ---------- 4. margin deductions (dated on approval) for manager and accountant ----------
  const mg = await call("pages/api/reports/margin.js", { ...M, query: { from: today, to: today } });
  assert.strictEqual(mg.status, 200, JSON.stringify(mg.json));
  assert.deepStrictEqual([mg.json.deductions.agentSamples, mg.json.deductions.obsolete, mg.json.deductions.freeSamples, mg.json.deductions.total], [1200, 1800, 2400, 5400]);
  assert.strictEqual(mg.json.netMargin, Math.round((mg.json.salesMargin - mg.json.deductions.total) * 100) / 100);
  const rp = await call("pages/api/accounting/report.js", { ...AC, query: { from: today, to: today } });
  assert.deepStrictEqual([rp.json.deductions.agentSamples, rp.json.deductions.total], [1200, 5400]);
  // accountant's inventory movements: everything, filterable
  const all = await call(A, { ...AC, query: { withDamage: "1" } });
  assert.ok(all.json.rows.length >= 4);
  assert.deepStrictEqual((await call(A, { ...AC, query: { kind: "freeSample", status: "rejected" } })).json.rows.map((r) => r.id), [rid(10)]);
  assert.strictEqual((await call(A, { ...AC, method: "POST", body: { id: rid(9), action: "approve" } })).status, 403);
  const na = await call("pages/api/notifications.js", AC);
  assert.ok(na.json.items.length >= 3 && na.json.items.every((i) => !i.needsAction && i.href.startsWith("/accounting/stock-movements?tab="))); // informative only
  // the manager hears how his free-sample requests ended
  assert.ok((await call("pages/api/notifications.js", M)).json.items.some((i) => i.tab === "freeSample" && !i.needsAction));
  ok("margin deductions show on the manager's margin and the accountant's report (net margin); the accountant sees every movement and gets informative notifications");

  console.log("ALL STOCK-ADJUSTMENT SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
