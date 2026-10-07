// Phase 1 read savings beyond the dashboards: server-side caching of the
// product list and English names, client delta sync, notification
// signatures, and the rate limiter without Firestore.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, headers = {}, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, headers: { authorization: t, ...headers } }, res);
  return { status, json };
};
const reads = async (fn) => { db._resetReads(); const r = await fn(); return [db._stats.reads, r]; };
const MGR = { role: "manager", uid: "m" };
const W = { role: "agent_car1", uid: "w1" };
const R = { role: "agent_car2", uid: "r1", salesSupervisor: false };
const { applyDelta } = require("../lib/clientsStore");

(async () => {
  // ---------- 1. product list + English names cache ----------
  for (let i = 1; i <= 8; i++) await db.collection("products").doc("p" + i).set({ name: "منتج " + i, nameEn: "Product " + i, unit: "ctn", active: i !== 8, prices: { car1: 100, car2: 120 }, stock: { depot: 50, car1: 20, car2: 20 }, avgCost: 60 });
  const P = "pages/api/products/list.js";
  const [r1, first] = await reads(() => call(P, W));
  assert.strictEqual(first.json.products.length, 7);
  const [r2, second] = await reads(() => call(P, W));
  assert.deepStrictEqual(second.json, first.json);
  assert.ok(r1 >= 9 && r2 === 1, "first " + r1 + " reads, then " + r2);
  assert.strictEqual((await call(P, { ...MGR, query: { all: "1" } })).json.products.length, 8);
  assert.ok((await call(P, W)).json.products.every((p) => p.avgCost === undefined)); // per-role trimming still per request
  const up = await call("pages/api/products/[id]/update.js", { ...MGR, method: "PATCH", query: { id: "p1" }, body: { name: "منتج أول" } });
  assert.strictEqual(up.status, 200, JSON.stringify(up.json));
  assert.ok((await call(P, W)).json.products.some((p) => p.name === "منتج أول"));
  await db.collection("clients").doc("1000").set({ name: "C", route: "car1", active: true });
  const inv = await call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: "1000", items: [{ productId: "p2", qty: 3 }], requestId: "req-cache-00000001" } });
  assert.strictEqual(inv.status, 201, JSON.stringify(inv.json));
  assert.strictEqual((await call(P, W)).json.products.find((p) => p.id === "p2").stock.car1, 17);
  const T = "pages/api/i18n/terms.js";
  await call(T, W);
  const [rt] = await reads(() => call(T, W));
  assert.strictEqual(rt, 1);
  ok("product list and English names: cached per server (1 read when unchanged); an edit or a sale shows immediately");

  // ---------- 2. client delta sync ----------
  const reg = async (who, n, extra = {}) => {
    const r = await call("pages/api/clients/register.js", { ...who, method: "POST", body: { nameFirst: "أ", nameMiddle: "ب", nameLast: "ج" + n, storeName: "S" + n, deliveryRoute: "خط", location: "L", phone: "09" + String(10000000 + n), storeClass: "A", requestId: "req-delta-client-" + String(n).padStart(4, "0"), ...extra } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    return r.json.clientId;
  };
  const ids = [];
  for (let n = 1; n <= 6; n++) ids.push(await reg(W, n));
  const L = "pages/api/clients/list.js";
  const full = await call(L, W);
  assert.ok(full.json.syncAt && full.json.clients.length === 6);
  const cache = { version: full.json.version, syncAt: full.json.syncAt, clients: full.json.clients };
  const same = await call(L, { ...W, query: { v: cache.version, since: cache.syncAt } });
  assert.ok(same.json.unchanged);
  await new Promise((r) => setTimeout(r, 5));
  // Older writes fall outside the 2-minute overlap; age them for the test.
  for (const id of ids) await db.collection("clients").doc(id).update({ syncAt: new Date(Date.now() - 10 * 60e3).toISOString() });
  const pat = await call("pages/api/clients/[id]/index.js", { ...W, method: "PATCH", query: { id: ids[0] }, body: { storeName: "متجر جديد" } });
  assert.strictEqual(pat.status, 200, JSON.stringify(pat.json));
  const [rd, delta] = await reads(() => call(L, { ...W, query: { v: cache.version, since: new Date(Date.now() - 3 * 60e3).toISOString() } }));
  assert.ok(delta.json.delta);
  assert.deepStrictEqual(delta.json.clients.map((c) => c.id), [ids[0]]);
  assert.ok(rd <= 2, "delta read " + rd);
  const merged = applyDelta(cache.clients, delta.json.clients, delta.json.removed);
  assert.strictEqual(merged.length, 6);
  assert.strictEqual(merged.find((c) => c.id === ids[0]).storeName, "متجر جديد");
  // manager moves a client to retail: the wholesale device drops it, the retail device receives it
  const mv = await call("pages/api/clients/[id]/index.js", { ...MGR, method: "PATCH", query: { id: ids[1] }, body: { route: "car2" } });
  assert.strictEqual(mv.status, 200);
  const dW = await call(L, { ...W, query: { v: "old", since: new Date(Date.now() - 3 * 60e3).toISOString() } });
  assert.deepStrictEqual(dW.json.removed, [ids[1]]);
  assert.ok(dW.json.clients.every((c) => c.route === "car1"));
  const dR = await call(L, { ...R, query: { v: "old", since: new Date(Date.now() - 3 * 60e3).toISOString() } });
  assert.deepStrictEqual(dR.json.clients.map((c) => c.id), [ids[1]]);
  assert.deepStrictEqual(dR.json.removed, []);
  assert.strictEqual(applyDelta(merged, dW.json.clients, dW.json.removed).length, 5);
  ok("client delta sync: unchanged = 1 read; a change downloads only that client; a moved client leaves the old route's devices");

  // ---------- 3. notifications / action items signature ----------
  await db.collection("changeRequests").doc("cr1").set({ type: "edit", status: "pending", route: "car1", requestedBy: "w1", requestedAt: new Date().toISOString() });
  const N = "pages/api/notifications.js";
  const n1 = await call(N, MGR);
  assert.ok(n1.json.sig && n1.json.items.length === 1);
  const [rn, n2] = await reads(() => call(N, { ...MGR, query: { sig: n1.json.sig } }));
  assert.ok(n2.json.unchanged && rn === 1);
  assert.ok(!(await call(N, { role: "manager", uid: "other", query: { sig: n1.json.sig } })).json.unchanged); // another person never reuses it
  const { bumpVersions } = require("../lib/versions");
  await bumpVersions(["requests"]);
  assert.ok(!(await call(N, { ...MGR, query: { sig: n1.json.sig } })).json.unchanged);
  const A = "pages/api/action-items.js";
  const a1 = await call(A, MGR);
  assert.strictEqual(a1.json.count, 1);
  assert.ok((await call(A, { ...MGR, query: { sig: a1.json.sig } })).json.unchanged);
  // bounded history for an agent: newest 20 decided requests only
  for (let i = 0; i < 30; i++) await db.collection("changeRequests").doc("old" + i).set({ type: "edit", status: "approved", route: "car1", requestedBy: "w1", requestedAt: "2026-01-01", decidedAt: "2026-02-" + String(1 + (i % 28)).padStart(2, "0") + "T0" + (i % 10) + ":00:00Z" });
  const [ra, ag] = await reads(() => call(N, W));
  assert.strictEqual(ag.json.items.filter((x) => x.bucket === "modification").length, 20);
  assert.ok(ra < 30, "agent notifications read " + ra);
  // index not deployed yet → old query, same answer
  const realColl = db.collection.bind(db);
  db.collection = (name) => {
    const c = realColl(name);
    if (name !== "changeRequests") return c;
    const wrap = (q) => ({ ...q, where: (f, op, v) => { if (op === "in") { const e = new Error("9 FAILED_PRECONDITION: requires an index"); e.code = 9; throw e; } return wrap(q.where(f, op, v)); } });
    return wrap(c);
  };
  const warn = console.warn; console.warn = () => {};
  const fb = await call(N, W);
  console.warn = warn;
  db.collection = realColl;
  assert.deepStrictEqual(fb.json.items.map((x) => x.id), ag.json.items.map((x) => x.id));
  ok("notifications: same signature = 1 read; resolved history bounded to the newest 20; works before the indexes are deployed");

  // ---------- 4. no public endpoints left ----------
  // Every API route must check the staff login (requireUser); the only
  // exception is the nightly cron, which checks CRON_SECRET instead.
  const fs = require("fs"), path = require("path");
  const walk = (d) => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
  const apiFiles = walk(path.join(ROOT, "pages/api")).filter((f) => f.endsWith(".js"));
  const open = apiFiles.filter((f) => !fs.readFileSync(f, "utf8").includes("requireUser(") && !fs.readFileSync(f, "utf8").includes("CRON_SECRET"));
  assert.deepStrictEqual(open.map((f) => path.relative(ROOT, f)), []);
  for (const gone of ["pages/new-order.js", "pages/api/orders/create.js", "pages/api/clients/lookup-route.js"]) assert.ok(!fs.existsSync(path.join(ROOT, gone)), gone);
  ok("no API route without a staff login (" + apiFiles.length + " routes checked); client self-order page and endpoints removed");

  console.log("ALL PHASE-1 CACHE/SYNC SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
