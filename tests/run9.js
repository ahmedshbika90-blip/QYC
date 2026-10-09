// Roles round: admin account management, legacy "supervisor" → "manager",
// revoked sessions, sales supervisor fleet history, accountant payments,
// executive dashboard figures.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
// Same as run.js's call(), with res.setHeader (used by the newer endpoints).
call = async function (rel, { method = "GET", role, uid, email, query = {}, body } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify({ role, uid, email })).toString("base64");
  await h({ method, query, body, headers: { authorization: t } }, res);
  return { status, json };
};
// ---- fake Firebase Auth (users live in memory) ----
const fakeAuth = require.cache[fbPath].exports.adminAuth;
const users = {};
let uidSeq = 0;
const rec = (u) => ({ ...u, metadata: { creationTime: new Date().toUTCString(), lastSignInTime: null } });
Object.assign(fakeAuth, {
  async listUsers() { return { users: Object.values(users).map(rec), pageToken: undefined }; },
  async getUser(uid) { if (!users[uid]) { const e = new Error("nf"); e.code = "auth/user-not-found"; throw e; } return rec(users[uid]); },
  async createUser({ email, password, displayName }) {
    if (Object.values(users).some((u) => u.email === email)) { const e = new Error("x"); e.code = "auth/email-already-exists"; throw e; }
    const uid = "u" + ++uidSeq; users[uid] = { uid, email, displayName, disabled: false, customClaims: {}, _pw: password }; return rec(users[uid]);
  },
  async setCustomUserClaims(uid, claims) { users[uid].customClaims = claims; },
  async updateUser(uid, p) { if (p.password) users[uid]._pw = p.password; if ("disabled" in p) users[uid].disabled = p.disabled; if ("displayName" in p) users[uid].displayName = p.displayName; },
  async revokeRefreshTokens(uid) { users[uid].tokensValidAfterTime = new Date(Date.now() + 1000).toUTCString(); users[uid]._revoked = (users[uid]._revoked || 0) + 1; },
});
const ADM = { role: "admin", uid: "adm", email: "admin@x.com" };
users.adm = { uid: "adm", email: "admin@x.com", displayName: "Admin", disabled: false, customClaims: { role: "admin" } };
users.old = { uid: "old", email: "boss@x.com", displayName: "Boss", disabled: false, customClaims: { role: "supervisor" } };

(async () => {
  // 1. legacy supervisor token still works everywhere manager does
  const legacy = await call("pages/api/dashboard/summary.js", { role: "supervisor", uid: "old" });
  assert.strictEqual(legacy.status, 200, JSON.stringify(legacy.json));
  const notMgr = await call("pages/api/dashboard/summary.js", { role: "agent_car1", uid: "a" });
  assert.strictEqual(notMgr.status, 403);
  ok("legacy 'supervisor' accounts are treated as 'manager'; others still refused");

  // 2. admin endpoints: admin only
  for (const r of ["manager", "accountant", "executive", "agent_car1"]) {
    assert.strictEqual((await call("pages/api/admin/users/index.js", { role: r, uid: "z" })).status, 403);
  }
  const list = await call("pages/api/admin/users/index.js", ADM);
  assert.strictEqual(list.status, 200);
  const boss = list.json.users.find((u) => u.uid === "old");
  assert.deepStrictEqual([boss.role, boss.legacyRole], ["manager", "supervisor"]);
  ok("only the admin can see accounts; legacy role shown as manager and flagged");

  // 3. create, validation, duplicates
  const bad = await call("pages/api/admin/users/index.js", { ...ADM, method: "POST", body: { email: "nope", password: "12345678" } });
  assert.strictEqual(bad.status, 400);
  const shortPw = await call("pages/api/admin/users/index.js", { ...ADM, method: "POST", body: { email: "a@b.co", password: "123" } });
  assert.strictEqual(shortPw.status, 400);
  const badRole = await call("pages/api/admin/users/index.js", { ...ADM, method: "POST", body: { email: "a@b.co", password: "12345678", role: "god" } });
  assert.strictEqual(badRole.status, 400);
  const c = await call("pages/api/admin/users/index.js", { ...ADM, method: "POST", body: { email: "Acc@X.com ", password: "12345678", displayName: " Sara ", role: "accountant" } });
  assert.strictEqual(c.status, 201, JSON.stringify(c.json));
  assert.deepStrictEqual([c.json.user.email, c.json.user.displayName, c.json.user.role], ["acc@x.com", "Sara", "accountant"]);
  const dup = await call("pages/api/admin/users/index.js", { ...ADM, method: "POST", body: { email: "acc@x.com", password: "12345678" } });
  assert.strictEqual(dup.status, 409);
  ok("create account: email/password/role validated, email normalised, duplicates refused (409)");

  // 4. change role → sessions revoked; legacy fix-up does not revoke; self-protection
  const accUid = c.json.user.uid;
  const ch = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: accUid }, body: { role: "executive" } });
  assert.strictEqual(ch.status, 200);
  assert.strictEqual(users[accUid].customClaims.role, "executive");
  assert.strictEqual(users[accUid]._revoked, 1);
  const fix = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: "old" }, body: { role: "manager" } });
  assert.strictEqual(fix.status, 200);
  assert.strictEqual(users.old.customClaims.role, "manager");
  assert.strictEqual(users.old._revoked, undefined);
  const selfRole = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: "adm" }, body: { role: "manager" } });
  const selfOff = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: "adm" }, body: { disabled: true } });
  assert.deepStrictEqual([selfRole.status, selfOff.status], [400, 400]);
  const off = await call("pages/api/admin/users/[uid].js", { ...ADM, method: "PATCH", query: { uid: accUid }, body: { disabled: true } });
  assert.strictEqual(users[accUid].disabled, true);
  assert.strictEqual(users[accUid]._revoked, 2);
  const audit = Object.values(db._data.auditLog || {});
  assert.ok(audit.length === 3 && audit.every((a) => a.by === "adm"));
  ok("role change & disable end the person's sessions; 'supervisor'→'manager' re-save doesn't; admin can't demote/disable self; all audited");

  // 5. revoked / disabled tokens refused by every API
  const realTok = (o) => ({ ...o, auth_time: Math.floor(Date.now() / 1000) - 60 });
  const tokOf = (o) => "Bearer " + Buffer.from(JSON.stringify(o)).toString("base64");
  async function callRaw(rel, decoded) {
    const h = load(rel); let status, headers = {};
    const res = { status(s) { status = s; return this; }, json() { return this; }, setHeader(k, v) { headers[k] = v; } };
    await h({ method: "GET", query: {}, headers: { authorization: tokOf(decoded) } }, res);
    return { status, headers };
  }
  const r1 = await callRaw("pages/api/admin/users/index.js", realTok({ role: "executive", uid: accUid }));
  assert.strictEqual(r1.status, 401);
  assert.strictEqual(r1.headers["X-Session-Revoked"], "1");
  users.ok1 = { uid: "ok1", email: "ok@x.com", disabled: false, customClaims: { role: "executive" } };
  const r2 = await callRaw("pages/api/executive/stock.js", realTok({ role: "executive", uid: "ok1" }));
  assert.strictEqual(r2.status, 200);
  ok("disabled / signed-out accounts are refused with 401 + X-Session-Revoked; healthy ones pass");

  // ---------- seed sales data ----------
  const now = new Date();
  const iso = (m) => new Date(now.getTime() - m * 60e3).toISOString();
  await db.collection("products").doc("tah").set({ name: "طحنية", category: "طحنية", unit: "ctn", active: true, avgCost: 50, prices: { car1: 80, car2: 90 }, stock: { depot: 100, car1: 20, car2: 5, damaged: 1 } });
  await db.collection("products").doc("chp").set({ name: "شيبسيانو", category: "شبس", unit: "ctn", active: true, avgCost: 10, prices: { car1: 15, car2: 18 }, stock: { depot: 40, car1: 8, car2: 3 } });
  await db.collection("clients").doc("2001").set({ name: "Wholesaler A", route: "car1", active: true });
  await db.collection("clients").doc("2002").set({ name: "Shop B", route: "car2", active: true });
  await db.collection("clients").doc("2003").set({ name: "Shop C", route: "car2", active: false });
  await db.collection("orders").doc("o1").set({ route: "car1", clientId: "2001", status: "active", createdAt: iso(30), total: 900, subtotal: 900, discount: 0,
    items: [{ productId: "tah", name: "طحنية", qty: 10, price: 80, subtotal: 800, unitCost: 48 }, { productId: "chp", name: "شيبسيانو", qty: 0 + 5, price: 20, subtotal: 100, unitCost: 9 }, { productId: "chp", name: "شيبسيانو", qty: 2, subtotal: 0, freeSample: true, unitCost: 9 }] });
  await db.collection("orders").doc("o2").set({ route: "car2", clientId: "2002", status: "active", createdAt: iso(20), total: 180, subtotal: 180, discount: 0,
    items: [{ productId: "chp", name: "شيبسيانو", qty: 10, price: 18, subtotal: 180 }] });
  await db.collection("orders").doc("o3").set({ route: "car2", clientId: "2002", status: "cancelled", createdAt: iso(10), total: 90, items: [{ productId: "tah", qty: 1, price: 90, subtotal: 90, unitCost: 50 }] });

  // 6. accountant payments
  const ACC = { role: "accountant", uid: "acc1", email: "acc@x.com" };
  const pay = (body, who = ACC) => directPay(who, "o1", body);
  const rid = (n) => "req-payment-" + String(n).padStart(8, "0");
  for (const r of ["manager", "executive", "agent_car1", "warehouse_keeper"]) {
    assert.strictEqual((await call("pages/api/payments/[orderId].js", { role: r, uid: "x", query: { orderId: "o1" } })).status, 403);
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
  assert.strictEqual((await pay({ ref: "123456789012", bank: "bok", amount: 100, date: today, requestId: rid(1) })).status, 400); // 12 digits
  assert.strictEqual((await pay({ ref: "12a45", bank: "bok", amount: 100, date: today, requestId: rid(1) })).status, 400); // not digits
  assert.strictEqual((await pay({ ref: "12345", bank: "hsbc", amount: 100, date: today, requestId: rid(1) })).status, 400); // unknown bank
  assert.strictEqual((await pay({ ref: "12345", bank: "bok", amount: 0, date: today, requestId: rid(1) })).status, 400);
  assert.strictEqual((await pay({ ref: "12345", bank: "bok", amount: 10, date: "2999-01-01", requestId: rid(1) })).status, 400); // future
  const p1 = await pay({ ref: "١٢٣٤٥", bank: "bok", amount: "400", date: today, requestId: rid(1) });
  assert.strictEqual(p1.status, 201, JSON.stringify(p1.json));
  assert.strictEqual(p1.json.payment.ref, "12345"); // Arabic digits converted
  const again = await pay({ ref: "12345", bank: "bok", amount: "400", date: today, requestId: rid(1) });
  assert.ok(again.json.duplicate);
  const sameRef = await pay({ ref: "12345", bank: "bok", amount: 100, date: today, requestId: rid(2) });
  assert.strictEqual(sameRef.status, 409);
  const otherBankWarn = await pay({ ref: "12345", bank: "faisal", amount: 300, date: today, requestId: rid(3) });
  assert.strictEqual(otherBankWarn.status, 409); // same reference, other bank: same last 4 → approval first
  assert.ok(otherBankWarn.json.needsConfirm && otherBankWarn.json.similar[0].ref === "12345");
  assert.ok(!sameRef.json.needsConfirm); // same bank + reference: refused outright, nothing to approve
  const otherBank = await pay({ ref: "12345", bank: "faisal", amount: 300, date: today, requestId: rid(3), confirmSimilar: true });
  assert.strictEqual(otherBank.status, 201);
  const over = await pay({ ref: "777", bank: "nile", amount: 201, date: today, requestId: rid(4) });
  assert.strictEqual(over.status, 400);
  const g = await call("pages/api/payments/[orderId].js", { ...ACC, query: { orderId: "o1" } });
  assert.deepStrictEqual([g.json.summary.paid, g.json.summary.remaining, g.json.summary.status, g.json.payments.length], [700, 200, "partial", 2]);
  ok("payments: accountant only; ref = 1–11 digits (Arabic digits ok), 4 banks, amount > 0, no future date, no overpay, same bank+ref once, retry-safe");

  // 7. void frees the ref; cancelled invoice refuses payments; payments invisible elsewhere
  const v = await pay({ action: "void", paymentId: rid(1), reason: "خطأ في المبلغ" });
  assert.strictEqual(v.status, 200);
  assert.strictEqual(v.json.summary.paid, 300);
  assert.strictEqual((await pay({ ref: "12345", bank: "bok", amount: 600, date: today, requestId: rid(5), confirmSimilar: true })).status, 201);
  const full = await call("pages/api/payments/[orderId].js", { ...ACC, query: { orderId: "o1" } });
  assert.strictEqual(full.json.summary.status, "paid");
  assert.strictEqual(full.json.payments.filter((p) => p.voided).length, 1);
  assert.strictEqual((await directPay(ACC, "o3", { ref: "1", bank: "onb", amount: 1, date: today, requestId: rid(6) })).status, 400);
  // the API itself no longer takes new single-invoice payments
  assert.strictEqual((await call("pages/api/payments/[orderId].js", { ...ACC, method: "POST", query: { orderId: "o1" }, body: { ref: "77", bank: "onb", amount: 1, date: today, requestId: rid(7) } })).status, 409);
  const mgrView = await call("pages/api/orders/[id]/index.js", { role: "manager", uid: "m", query: { id: "o1" } });
  assert.ok(!JSON.stringify(mgrView.json).includes("12345"));
  const accList = await call("pages/api/accounting/invoices.js", { ...ACC, query: {} });
  assert.strictEqual(accList.status, 200);
  const row = accList.json.invoices.find((i) => i.id === "o1");
  assert.deepStrictEqual([row.payment.status, row.client.name], ["paid", "Wholesaler A"]);
  assert.ok(accList.json.invoices.every((i) => !("items" in i)));
  const unpaid = await call("pages/api/accounting/invoices.js", { ...ACC, query: { pay: "unpaid" } });
  assert.deepStrictEqual(unpaid.json.invoices.map((i) => i.id), ["o2"]);
  const inv = await call("pages/api/accounting/invoice.js", { ...ACC, query: { id: "o1" } });
  assert.ok(inv.json.order.items.every((it) => it.unitCost === undefined));
  ok("void keeps an audit row and frees the bank ref; cancelled invoices refuse payments; other roles never see payments; list filters by payment status; no cost to the accountant");

  // 8. accountant sees all stock (no avg cost)
  const st = await call("pages/api/products/list.js", { ...ACC, query: { all: "1" } });
  const t = st.json.products.find((p) => p.id === "tah");
  assert.deepStrictEqual([t.stock.depot, t.stock.car1, t.stock.car2, t.avgCost], [100, 20, 5, undefined]);
  ok("accountant sees depot + every van's stock, never the average cost");

  // 9. sales supervisor fleet history: confirmed van docs only, filter by car
  await db.collection("inventoryDocs").doc("d1").set({ type: "loading", route: "car2", status: "confirmed", createdAt: iso(50), items: [{ productId: "tah", name: "طحنية", qty: 3, costPrice: 40 }] });
  await db.collection("inventoryDocs").doc("d2").set({ type: "loading", route: "car2", status: "pending", createdAt: iso(40), items: [] });
  await db.collection("inventoryDocs").doc("d3").set({ type: "offloading", route: "car1", status: "confirmed", createdAt: iso(35), items: [] });
  await db.collection("inventoryDocs").doc("d4").set({ type: "received", route: null, status: "confirmed", createdAt: iso(45), finalizedAt: iso(44), items: [{ productId: "chp", name: "شيبسيانو", qty: 30, costPrice: 8 }] });
  const fl = await call("pages/api/inventory/list.js", { role: "agent_car1", uid: "a1", query: { scope: "fleet" } });
  assert.deepStrictEqual(fl.json.docs.map((d) => d.id).sort(), ["d1", "d3"]);
  assert.ok(fl.json.docs.every((d) => d.items.every((i) => i.costPrice === undefined)));
  const fl2 = await call("pages/api/inventory/list.js", { role: "agent_car1", uid: "a1", query: { scope: "fleet", route: "car2" } });
  assert.deepStrictEqual(fl2.json.docs.map((d) => d.id), ["d1"]);
  assert.strictEqual((await call("pages/api/inventory/list.js", { role: "agent_car2", uid: "a2", query: { scope: "fleet" } })).status, 403);
  assert.strictEqual((await call("pages/api/inventory/[id]/index.js", { role: "agent_car1", uid: "a1", query: { id: "d1" } })).status, 200);
  assert.strictEqual((await call("pages/api/inventory/[id]/index.js", { role: "agent_car1", uid: "a1", query: { id: "d2" } })).status, 403);
  assert.strictEqual((await call("pages/api/inventory/[id]/index.js", { role: "agent_car2", uid: "a2", query: { id: "d3" } })).status, 403);
  ok("sales supervisor: every van's CONFIRMED cargo docs (not pending, not depot), filter by car, can open them; retail agent can't");

  // 10. executive overview: units, mix, invoices, value AT COST
  const EX = { role: "executive", uid: "ex" };
  assert.strictEqual((await call("pages/api/executive/overview.js", { role: "accountant", uid: "x" })).status, 403);
  const ov = await call("pages/api/executive/overview.js", EX);
  assert.strictEqual(ov.status, 200, JSON.stringify(ov.json));
  const o = ov.json;
  assert.deepStrictEqual([o.wholesale.units, o.retail.units, o.totals.units], [15, 10, 25]); // free sample + cancelled excluded
  assert.deepStrictEqual([o.wholesale.invoices, o.retail.invoices], [1, 1]);
  assert.strictEqual(o.wholesale.costValue, 10 * 48 + 5 * 9); // frozen line cost
  assert.strictEqual(o.retail.costValue, 10 * 10); // no line cost → avgCost
  const grp = Object.fromEntries(o.groups.map((x) => [x.id, x]));
  assert.deepStrictEqual([grp.alwafi.label, grp.alwafi.units, grp.snacks.label, grp.snacks.units, grp.snacks.share], ["الوافي", 10, "شيبسيانو", 15, 60]);
  assert.deepStrictEqual(o.products.map((p) => [p.id, p.units, p.share]), [["chp", 15, 60], ["tah", 10, 40]]);
  assert.ok(!JSON.stringify(o).includes('"margin"') && !JSON.stringify(o).includes("price"));
  assert.strictEqual((await call("pages/api/dashboard/trend.js", { ...EX, query: { bucket: "day" } })).status, 200);
  assert.strictEqual((await call("pages/api/dashboard/summary.js", EX)).status, 403); // margin stays manager-only
  ok("executive overview: units w/r, Alwafi vs Chipsiano, per item %, invoices, value at inventory cost; no prices/margin; trend allowed, manager summary not");

  // 11. executive customers & stock
  const cu = await call("pages/api/executive/customers.js", EX);
  assert.strictEqual(cu.status, 200, JSON.stringify(cu.json));
  const regBy = Object.fromEntries(cu.json.registered.routes.map((r) => [r.route, r]));
  assert.deepStrictEqual([cu.json.registered.total, regBy.car1.total, regBy.car2.total, regBy.car2.inactive], [3, 1, 2, 1]);
  assert.strictEqual(Math.round(regBy.car2.share), 67);
  assert.deepStrictEqual(cu.json.top.map((x) => [x.id, x.invoices, x.units, x.share, x.name]), [["2001", 1, 15, 60, "Wholesaler A"], ["2002", 1, 10, 40, "Shop B"]]);
  const rt = Object.fromEntries(cu.json.routes.map((r) => [r.route, r]));
  assert.deepStrictEqual([rt.car2.invoices, rt.car2.buyers, rt.car2.reach], [1, 1, 100]);
  const ex = await call("pages/api/executive/stock.js", EX);
  assert.deepStrictEqual(ex.json.products.find((p) => p.id === "tah").stock, { depot: 100, car1: 20, car2: 5, damaged: 1 });
  assert.ok(!JSON.stringify(ex.json).includes("avgCost") && !JSON.stringify(ex.json).includes("prices"));
  const rc = await call("pages/api/executive/stock.js", { ...EX, query: { view: "received" } });
  assert.deepStrictEqual(rc.json.docs.map((d) => [d.id, d.units]), [["d4", 30]]);
  assert.ok(rc.json.docs[0].items.every((i) => i.costPrice === undefined));
  const cl = await call("pages/api/clients/list.js", EX);
  assert.strictEqual(cl.json.clients.length, 3);
  ok("executive customers: registered by route with %, inactive counted, top customers by units with share, route reach; stock & receipts quantities only; full client list readable");

  console.log("ALL ROLES-ROUND SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
