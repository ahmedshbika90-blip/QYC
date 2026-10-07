// Competitor prices (sales supervisor enters, executive reads) and the
// delivery route (المسار) on clients.
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
const SSUP = { role: "agent_car1", uid: "abdalbagi", salesSupervisor: true, name: "عبدالباقي" };
const AGENT = { role: "agent_car2", uid: "younis", salesSupervisor: false };
const EXEC = { role: "executive", uid: "amel" };
const MGR2 = { role: "manager", uid: "m" };
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
const rid = (n) => "req-competitor-" + String(n).padStart(6, "0");
const C = "pages/api/competitors/index.js";
const entry = (n, extra = {}) => ({ company: "شركة  سيقا", item: "طحنية سادة", sku: "sg-200 g", price: "52000", date: today, requestId: rid(n), ...extra });

(async () => {
  // 1. who can enter
  assert.strictEqual((await call(C, { ...AGENT, method: "POST", body: entry(1) })).status, 403);
  assert.strictEqual((await call(C, { ...EXEC, method: "POST", body: entry(1) })).status, 403);
  assert.strictEqual((await call(C, { ...MGR2, method: "POST", body: entry(1) })).status, 403);
  const a = await call(C, { ...SSUP, method: "POST", body: entry(1) });
  assert.strictEqual(a.status, 201, JSON.stringify(a.json));
  assert.deepStrictEqual([a.json.entry.company, a.json.entry.sku, a.json.entry.skuKey, a.json.entry.price, a.json.entry.createdByName], ["شركة سيقا", "sg-200 g", "SG-200G", 52000, "عبدالباقي"]);
  assert.ok(a.json.entry.createdBy === undefined);
  const again = await call(C, { ...SSUP, method: "POST", body: entry(1) });
  assert.ok(again.json.duplicate);
  assert.strictEqual(Object.keys(db._data.competitorPrices).length, 1);
  ok("only the sales supervisor enters competitor prices; text tidied, SKU grouped; a resend is stored once");

  // 2. validation
  for (const bad of [{ company: " " }, { item: "" }, { sku: "" }, { price: "0" }, { price: "abc" }, { date: "2999-01-01" }, { date: "1/2/2026" }, { requestId: "x" }]) {
    const r = await call(C, { ...SSUP, method: "POST", body: entry(9, bad) });
    assert.strictEqual(r.status, 400, JSON.stringify(bad) + " " + JSON.stringify(r.json));
  }
  ok("company, item, SKU, price > 0 and a non-future date are all required");

  // 3. who can read; executive sees everything, newest first
  await call(C, { ...SSUP, method: "POST", body: entry(2, { price: "٥٥٠٠٠", date: today }) });
  await call(C, { ...SSUP, method: "POST", body: entry(3, { company: "الأمل", price: "50000", date: "2026-01-05" }) });
  assert.strictEqual((await call(C, { ...AGENT })).status, 403);
  const ex = await call(C, { ...EXEC });
  assert.strictEqual(ex.status, 200, JSON.stringify(ex.json));
  assert.strictEqual(ex.json.entries.length, 3);
  assert.strictEqual(ex.json.entries[ex.json.entries.length - 1].date, "2026-01-05");
  assert.ok(ex.json.entries.every((e) => e.mine === false && e.createdBy === undefined));
  assert.strictEqual(ex.json.canEnter, false);
  assert.ok(ex.json.entries.some((e) => e.price === 55000)); // Arabic digits accepted
  const sup = await call(C, { ...SSUP });
  assert.ok(sup.json.canEnter && sup.json.entries.every((e) => e.mine));
  assert.strictEqual((await call(C, { ...MGR2 })).status, 200);
  ok("executive and manager read all entries (newest first); sales agents can't");

  // 4. delete: own entries only (or the manager)
  const D = "pages/api/competitors/[id].js";
  const OTHER = { role: "agent_car2", uid: "other-sup", salesSupervisor: true };
  assert.strictEqual((await call(D, { ...OTHER, method: "DELETE", query: { id: rid(3) } })).status, 403);
  assert.strictEqual((await call(D, { ...EXEC, method: "DELETE", query: { id: rid(3) } })).status, 403);
  assert.strictEqual((await call(D, { ...SSUP, method: "DELETE", query: { id: rid(3) } })).status, 200);
  assert.strictEqual((await call(D, { ...MGR2, method: "DELETE", query: { id: rid(2) } })).status, 200);
  assert.deepStrictEqual(Object.keys(db._data.competitorPrices), [rid(1)]);
  assert.ok(db._data.meta.versions.competitors >= 5);
  ok("a supervisor removes only his own entries; the manager can remove any; every change bumps the live counter");

  // 5. delivery route on clients: required on registration, editable, through edit requests
  const R = "pages/api/clients/register.js";
  const base = { nameFirst: "أ", nameMiddle: "ب", nameLast: "ج", storeName: "S", location: "شمبات", phone: "0911111111", storeClass: "A" };
  assert.strictEqual((await call(R, { ...SSUP, method: "POST", body: { ...base, requestId: "req-route-000000001" } })).status, 400);
  assert.strictEqual((await call(R, { ...SSUP, method: "POST", body: { ...base, deliveryRoute: "x".repeat(61), requestId: "req-route-000000002" } })).status, 400);
  const reg = await call(R, { ...SSUP, method: "POST", body: { ...base, deliveryRoute: "خط بحري", requestId: "req-route-000000003" } });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.json));
  const id = reg.json.clientId;
  const P = "pages/api/clients/[id]/index.js";
  assert.strictEqual((await call(P, { ...SSUP, method: "PATCH", query: { id }, body: { deliveryRoute: "  " } })).status, 400);
  assert.strictEqual((await call(P, { ...SSUP, method: "PATCH", query: { id }, body: { deliveryRoute: "خط  الخرطوم" } })).status, 200);
  assert.strictEqual(db._data.clients[id].deliveryRoute, "خط الخرطوم");
  const { changedFields, buildClientUpdates } = require("../lib/clientFields");
  assert.deepStrictEqual(changedFields(buildClientUpdates({ deliveryRoute: "خط أم درمان" }, db._data.clients[id]), db._data.clients[id]), { deliveryRoute: "خط أم درمان" });
  ok("route (المسار): required for new clients, tidied, editable, and part of edit requests");

  console.log("ALL COMPETITORS/ROUTE SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
