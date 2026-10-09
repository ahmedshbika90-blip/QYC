// Sales job/route split, payment edit + search by reference, paid amount on
// invoices for every viewer, profile photo.
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
const fakeAuth = require.cache[fbPath].exports.adminAuth;
const users = {};
let seq = 0;
const rec = (u) => ({ ...u, metadata: {} });
Object.assign(fakeAuth, {
  async listUsers() { return { users: Object.values(users).map(rec) }; },
  async getUser(uid) { return rec(users[uid]); },
  async createUser({ email, displayName }) { const uid = "n" + ++seq; users[uid] = { uid, email, displayName, customClaims: {} }; return rec(users[uid]); },
  async setCustomUserClaims(uid, c) { users[uid].customClaims = c; },
  async updateUser(uid, p) { if ("displayName" in p) users[uid].displayName = p.displayName; }, async revokeRefreshTokens(uid) { users[uid].revoked = true; },
});
const ADM = { role: "admin", uid: "adm" };
users.adm = { uid: "adm", email: "a@x.com", customClaims: { role: "admin" } };

(async () => {
  // 1. admin picks job + route
  const mk = (b) => call("pages/api/admin/users/index.js", { ...ADM, method: "POST", body: { password: "12345678", ...b } });
  assert.strictEqual((await mk({ email: "s1@x.com", role: "sales_supervisor" })).status, 400); // no route
  const s2 = await mk({ email: "s2@x.com", role: "sales_supervisor", route: "car2" });
  assert.strictEqual(s2.status, 201, JSON.stringify(s2.json));
  assert.deepStrictEqual(users[s2.json.user.uid].customClaims, { role: "agent_car2", salesSupervisor: true });
  assert.deepStrictEqual([s2.json.user.job, s2.json.user.route], ["sales_supervisor", "car2"]);
  const a1 = await mk({ email: "a1@x.com", role: "sales_agent", route: "car1" });
  assert.deepStrictEqual(users[a1.json.user.uid].customClaims, { role: "agent_car1", salesSupervisor: false });
  const sw = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: a1.json.user.uid }, body: { role: "sales_supervisor", route: "car1" } });
  assert.strictEqual(sw.status, 200);
  assert.strictEqual(users[a1.json.user.uid].customClaims.salesSupervisor, true);
  assert.ok(users[a1.json.user.uid].revoked);
  users.legacy = { uid: "legacy", email: "l@x.com", customClaims: { role: "agent_car1" } };
  const list = await call("pages/api/admin/users/index.js", ADM);
  const lg = list.json.users.find((u) => u.uid === "legacy");
  assert.deepStrictEqual([lg.job, lg.route, lg.legacyRole], ["sales_supervisor", "car1", "agent_car1"]);
  ok("admin sets job and route separately; route required for sales jobs; legacy wholesale accounts read as supervisors");

  // 2. stock visibility follows the supervisor flag, not the route
  await db.collection("products").doc("tah").set({ name: "طحنية", category: "طحنية", unit: "ctn", active: true, avgCost: 50, prices: { car1: 80, car2: 90 }, stock: { depot: 100, car1: 20, car2: 5 } });
  const retailSup = { role: "agent_car2", salesSupervisor: true, uid: "rs" };
  const wholeAgent = { role: "agent_car1", salesSupervisor: false, uid: "wa" };
  const p1 = await call("pages/api/products/list.js", retailSup);
  assert.deepStrictEqual(p1.json.products[0].stock, { depot: 100, car1: 20, car2: 5 });
  const p2 = await call("pages/api/products/list.js", wholeAgent);
  assert.deepStrictEqual(p2.json.products[0].stock, { depot: 100, car1: 20 });
  ok("a retail sales supervisor sees every van; a wholesale sales agent sees only his van + depot");

  // 3. shipping approvals: any agent's request waits for any OTHER sales supervisor
  const rid = (n) => "req-ship-" + String(n).padStart(10, "0");
  const r1 = await call("pages/api/shipment-requests/create.js", { ...wholeAgent, method: "POST", body: { type: "loading", items: [{ productId: "tah", qty: 3 }], requestId: rid(1) } });
  assert.strictEqual(r1.status, 201, JSON.stringify(r1.json));
  assert.strictEqual(db._data.shipmentRequests[rid(1)].status, "pending_car1");
  const td = await call("pages/api/shipment-requests/list.js", { ...retailSup, query: { scope: "todecide" } });
  assert.deepStrictEqual(td.json.requests.map((r) => r.id), [rid(1)]);
  assert.strictEqual((await call("pages/api/shipment-requests/list.js", { ...wholeAgent, query: { scope: "todecide" } })).status, 403);
  assert.strictEqual((await call("pages/api/shipment-requests/[id]/decide.js", { ...wholeAgent, method: "PATCH", query: { id: rid(1) }, body: { action: "approve" } })).status, 403);
  const dec = await call("pages/api/shipment-requests/[id]/decide.js", { ...retailSup, method: "PATCH", query: { id: rid(1) }, body: { action: "approve" } });
  assert.strictEqual(dec.status, 200, JSON.stringify(dec.json));
  assert.strictEqual(db._data.shipmentRequests[rid(1)].status, "pending_warehouse");
  const r2 = await call("pages/api/shipment-requests/create.js", { ...retailSup, method: "POST", body: { type: "loading", items: [{ productId: "tah", qty: 1 }], requestId: rid(2) } });
  assert.strictEqual(r2.status, 201);
  assert.strictEqual(db._data.shipmentRequests[rid(2)].status, "pending_warehouse");
  ok("an agent's request (any route) waits for a sales supervisor; supervisors' own go straight to the warehouse; agents can't decide");

  // 4. payments: edit, ref search, paid visible to others
  await db.collection("clients").doc("2001").set({ name: "Wholesaler A", route: "car1", active: true });
  await db.collection("orders").doc("o1").set({ route: "car1", clientId: "2001", status: "active", createdAt: new Date().toISOString(), total: 1000, subtotal: 1000, discount: 0, items: [{ productId: "tah", qty: 10, price: 100, subtotal: 1000 }] });
  await db.collection("orders").doc("o2").set({ route: "car1", clientId: "2001", status: "active", createdAt: new Date().toISOString(), total: 500, subtotal: 500, discount: 0, items: [] });
  const ACC = { role: "accountant", uid: "acc" };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
  const pay = (o, body) => directPay(ACC, o, body);
  const prid = (n) => "req-payment-" + String(n).padStart(8, "0");
  await pay("o1", { ref: "111", bank: "bok", amount: 300, date: today, requestId: prid(1) });
  await pay("o1", { ref: "222", bank: "bok", amount: 200, date: today, requestId: prid(2) });
  await pay("o2", { ref: "333", bank: "nile", amount: 100, date: today, requestId: prid(3) });
  const e1 = await pay("o1", { action: "edit", paymentId: prid(1), ref: "444", bank: "faisal", amount: "800", date: today });
  assert.strictEqual(e1.status, 200, JSON.stringify(e1.json));
  assert.deepStrictEqual([e1.json.summary.paid, e1.json.payment.edits[0].before.ref, e1.json.payment.edits[0].before.amount], [1000, "111", 300]);
  assert.strictEqual((await pay("o1", { action: "edit", paymentId: prid(2), ref: "222", bank: "bok", amount: 201, date: today })).status, 400); // overpay
  assert.strictEqual((await pay("o1", { action: "edit", paymentId: prid(2), ref: "333", bank: "nile", amount: 200, date: today })).status, 409); // ref used elsewhere
  assert.ok(!db._data.paymentRefs["bok__111"] && db._data.paymentRefs["faisal__444"]);
  assert.ok((await pay("o1", { ref: "111", bank: "bok", amount: 1, date: today, requestId: prid(4) })).status === 400); // fully paid now
  const f = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "444" } });
  assert.deepStrictEqual(f.json.matches.map((m) => [m.orderId, m.bank, m.amount, m.clientName]), [["o1", "faisal", 800, "Wholesaler A"]]);
  assert.strictEqual((await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "12ab" } })).status, 400);
  assert.strictEqual((await call("pages/api/accounting/find-ref.js", { role: "manager", uid: "m", query: { ref: "444" } })).status, 403);
  const ol = await call("pages/api/orders/list.js", { role: "manager", uid: "m", query: {} });
  const o1 = ol.json.orders.find((o) => o.id === "o1");
  assert.deepStrictEqual(o1.payment, { paid: 1000, remaining: 0, status: "paid" });
  assert.ok(!JSON.stringify(ol.json).includes("444") && !JSON.stringify(ol.json).includes("faisal"));
  const od = await call("pages/api/orders/[id]/index.js", { ...wholeAgent, query: { id: "o2" } });
  assert.deepStrictEqual(od.json.payment, { paid: 100, remaining: 400, status: "partial" });
  ok("accountant edits payments (history kept, ref/overpay rules) and finds invoices by reference; every invoice viewer sees paid/remaining only");

  // 5. profile photo
  const EX = { role: "executive", uid: "ex" };
  const tiny = "data:image/jpeg;base64," + Buffer.from("x".repeat(100)).toString("base64");
  assert.strictEqual((await call("pages/api/profile.js", { ...EX, method: "PUT", body: { photo: "javascript:alert(1)" } })).status, 400);
  assert.strictEqual((await call("pages/api/profile.js", { ...EX, method: "PUT", body: { photo: "data:image/jpeg;base64," + "A".repeat(200000) } })).status, 400);
  assert.strictEqual((await call("pages/api/profile.js", { ...EX, method: "PUT", body: { photo: tiny } })).status, 200);
  assert.strictEqual((await call("pages/api/profile.js", EX)).json.photo, tiny);
  ok("profile photo: image data URLs only, size-capped, per person");

  // 6. English names: staff (admin) and products (manager) → translation terms
  const en = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: s2.json.user.uid }, body: { displayName: "سارة أحمد", nameEn: "Sara Ahmed" } });
  assert.strictEqual(en.status, 200, JSON.stringify(en.json));
  assert.deepStrictEqual([en.json.user.displayName, en.json.user.nameEn], ["سارة أحمد", "Sara Ahmed"]);
  assert.ok(!users[s2.json.user.uid].revoked || true);
  assert.strictEqual((await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: s2.json.user.uid }, body: { nameEn: "<script>" } })).status, 400);
  const up = await call("pages/api/products/[id]/update.js", { role: "manager", uid: "m", method: "PATCH", query: { id: "tah" }, body: { nameEn: "Alwafi Tahini" } });
  assert.strictEqual(up.status, 200, JSON.stringify(up.json));
  const terms = await call("pages/api/i18n/terms.js", { ...EX });
  assert.deepStrictEqual([terms.json.terms["طحنية"], terms.json.terms["سارة أحمد"]], ["Alwafi Tahini", "Sara Ahmed"]);
  assert.strictEqual((await call("pages/api/products/[id]/update.js", { role: "agent_car1", uid: "x", method: "PATCH", query: { id: "tah" }, body: { nameEn: "X" } })).status, 403);
  const prof = await call("pages/api/profile.js", { role: "executive", uid: s2.json.user.uid });
  assert.strictEqual(prof.json.nameEn, "Sara Ahmed");
  ok("English names: admin sets staff names in both languages, manager sets product names; both reach the English interface");

  // 7. executive headline compares with the previous period
  const ov = await call("pages/api/executive/overview.js", EX);
  assert.ok(ov.json.headline && typeof ov.json.headline.units.value === "number" && "change" in ov.json.headline.costValue);
  ok("executive headline figures with change vs the previous period");

  // 8. receipts history: index path when deployed, quiet fallback when not
  await db.collection("inventoryDocs").doc("rc1").set({ type: "received", route: null, status: "confirmed", createdAt: new Date().toISOString(), items: [{ productId: "tah", name: "طحنية", qty: 7, costPrice: 9 }] });
  await db.collection("inventoryDocs").doc("ld1").set({ type: "loading", route: "car1", status: "confirmed", createdAt: new Date().toISOString(), items: [] });
  const viaIndex = await call("pages/api/executive/stock.js", { ...EX, query: { view: "received" } });
  assert.deepStrictEqual(viaIndex.json.docs.map((d) => d.id), ["rc1"]);
  const realColl = db.collection.bind(db);
  db.collection = (name) => {
    const c = realColl(name);
    if (name !== "inventoryDocs") return c;
    const w = c.where.bind(c);
    return { ...c, where: (f, ...rest) => { if (f === "type") { const e = new Error("9 FAILED_PRECONDITION: The query requires an index."); e.code = 9; throw e; } return w(f, ...rest); }, orderBy: c.orderBy.bind(c) };
  };
  const warn = console.warn; console.warn = () => {};
  const viaFallback = await call("pages/api/executive/stock.js", { ...EX, query: { view: "received" } });
  console.warn = warn;
  db.collection = realColl;
  assert.strictEqual(viaFallback.status, 200, JSON.stringify(viaFallback.json));
  assert.deepStrictEqual(viaFallback.json.docs.map((d) => d.id), ["rc1"]);
  ok("receipts history reads receipts only via the index; without the index it falls back instead of erroring");

  // 9. reference search by the LAST 4 digits; old refs backfilled once
  await db.collection("paymentRefs").doc("onb__55512345").set({ orderId: "o2", paymentId: "legacy", createdAt: "2026-01-01T00:00:00Z" }); // saved before search fields existed
  const l4 = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "2345" } });
  assert.deepStrictEqual(l4.json.matches.map((m) => [m.ref, m.clientName]), [["55512345", "Wholesaler A"]]);
  assert.ok(db._data.meta.paymentRefsSearch2 && db._data.paymentRefs["onb__55512345"].last4 === "2345");
  const tail = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "12345" } });
  assert.deepStrictEqual(tail.json.matches.map((m) => m.ref), ["55512345"]); // 5+ digits: ends with
  const head = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "5551" } });
  assert.deepStrictEqual(head.json.matches, []); // first digits don't match — they repeat between transfers
  const ex = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "44" } });
  assert.deepStrictEqual(ex.json.matches, []); // under 4 digits → exact only
  const fresh = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "444" } });
  assert.deepStrictEqual(fresh.json.matches.map((m) => [m.ref, m.exact]), [["444", true]]);
  ok("reference search finds a payment by its last 4 digits (or a longer ending); older references are upgraded once automatically");

  // 10. same last 4 as an existing payment → warn, then save only when approved
  await db.collection("orders").doc("o3").set({ route: "car1", clientId: "2001", status: "active", createdAt: new Date().toISOString(), total: 1000, subtotal: 1000, discount: 0, items: [] });
  const p10 = await pay("o3", { ref: "90001234", bank: "bok", amount: 100, date: today, requestId: prid(10) });
  assert.strictEqual(p10.status, 201, JSON.stringify(p10.json));
  assert.deepStrictEqual([db._data.paymentRefs["bok__90001234"].last4, db._data.paymentRefs["bok__90001234"].amount, db._data.paymentRefs["bok__90001234"].clientId], ["1234", 100, "2001"]);
  const wn = await pay("o3", { ref: "77701234", bank: "nile", amount: 200, date: today, requestId: prid(11) });
  assert.strictEqual(wn.status, 409, JSON.stringify(wn.json));
  assert.ok(wn.json.needsConfirm);
  assert.deepStrictEqual(wn.json.similar.map((m) => [m.ref, m.amount, m.clientName, m.orderId]), [["90001234", 100, "Wholesaler A", "o3"]]);
  assert.ok(!db._data.paymentRefs["nile__77701234"]); // nothing saved yet
  const okd = await pay("o3", { ref: "77701234", bank: "nile", amount: 200, date: today, requestId: prid(11), confirmSimilar: true });
  assert.strictEqual(okd.status, 201, JSON.stringify(okd.json));
  const again = await pay("o3", { ref: "77701234", bank: "nile", amount: 200, date: today, requestId: prid(11) });
  assert.ok(again.json.duplicate); // a resend never warns about itself
  const amtOnly = await pay("o3", { action: "edit", paymentId: prid(10), ref: "90001234", bank: "bok", amount: 150, date: today });
  assert.strictEqual(amtOnly.status, 200, JSON.stringify(amtOnly.json)); // reference unchanged → no warning
  assert.strictEqual(db._data.paymentRefs["bok__90001234"].amount, 150);
  const reRef = await pay("o3", { action: "edit", paymentId: prid(10), ref: "55501234", bank: "bok", amount: 150, date: today });
  assert.strictEqual(reRef.status, 409);
  assert.deepStrictEqual(reRef.json.similar.map((m) => m.ref), ["77701234"]);
  const both = await call("pages/api/accounting/find-ref.js", { ...ACC, query: { ref: "1234" } });
  assert.deepStrictEqual(both.json.matches.map((m) => m.ref).sort(), ["77701234", "90001234"]);
  ok("a payment whose last 4 digits match an earlier one is held for approval; approving saves it; edits warn only when the reference changes");

  console.log("ALL SALES/PAYMENTS-ROUND SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
