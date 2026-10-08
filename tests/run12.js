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
const entry = (n, extra = {}) => ({ date: today, deliveryRoute: "خط  بحري", company: "شركة  سيقا", item: "طحنية سادة", weight: "٤٠٠", weightUnit: "g", price: "52000", requestId: rid(n), ...extra });

(async () => {
  // 1. who can enter
  assert.strictEqual((await call(C, { ...AGENT, method: "POST", body: entry(1) })).status, 403);
  assert.strictEqual((await call(C, { ...EXEC, method: "POST", body: entry(1) })).status, 403);
  assert.strictEqual((await call(C, { ...MGR2, method: "POST", body: entry(1) })).status, 403);
  const a = await call(C, { ...SSUP, method: "POST", body: entry(1) });
  assert.strictEqual(a.status, 201, JSON.stringify(a.json));
  assert.deepStrictEqual([a.json.entry.deliveryRoute, a.json.entry.company, a.json.entry.weight, a.json.entry.weightUnit, a.json.entry.itemKey, a.json.entry.price, a.json.entry.createdByName], ["خط بحري", "شركة سيقا", 400, "g", "طحنيه ساده|400g", 52000, "عبدالباقي"]);
  assert.ok(a.json.entry.sku === undefined);
  // a route first typed here joins the route list (places) for every form
  assert.deepStrictEqual(db._data.places["car1__route__خط بحري"].name, "خط بحري");
  assert.ok(a.json.entry.createdBy === undefined);
  const again = await call(C, { ...SSUP, method: "POST", body: entry(1) });
  assert.ok(again.json.duplicate);
  assert.strictEqual(Object.keys(db._data.competitorPrices).length, 1);
  ok("only the sales supervisor enters competitor prices; text tidied, grouped by item + weight; a resend is stored once");

  // 2. validation
  for (const bad of [{ company: " " }, { item: "" }, { deliveryRoute: "" }, { weight: "" }, { weight: "0" }, { weightUnit: "lb" }, { price: "0" }, { price: "abc" }, { date: "2999-01-01" }, { date: "1/2/2026" }, { requestId: "x" }]) {
    const r = await call(C, { ...SSUP, method: "POST", body: entry(9, bad) });
    assert.strictEqual(r.status, 400, JSON.stringify(bad) + " " + JSON.stringify(r.json));
  }
  ok("date, route, company, item, weight (+unit), price > 0 are all required; no SKU");

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

  // 6. routes & locations added without a client (clients screen)
  const PL = "pages/api/places.js";
  const R2 = { role: "agent_car2", uid: "younis", salesSupervisor: false };
  const p1 = await call(PL, { ...SSUP, method: "POST", body: { route: "خط  الكلاكلة", location: "الكلاكلة صنقعت" } });
  assert.strictEqual(p1.status, 201, JSON.stringify(p1.json));
  assert.deepStrictEqual(p1.json.added.map((p) => [p.kind, p.name, p.salesRoute, p.deliveryRoute || null]), [["route", "خط الكلاكلة", "car1", null], ["location", "الكلاكلة صنقعت", "car1", "خط الكلاكلة"]]);
  const again2 = await call(PL, { ...SSUP, method: "POST", body: { route: "خط الكلاكلة" } });
  assert.strictEqual(again2.status, 200); assert.deepStrictEqual(again2.json.added, []); // stored once
  assert.strictEqual((await call(PL, { ...MGR2, method: "POST", body: { route: "x" } })).status, 400); // manager must pick the sales type
  assert.strictEqual((await call(PL, { ...MGR2, method: "POST", body: { route: "خط أمبدة", salesRoute: "car2" } })).status, 201);
  assert.strictEqual((await call(PL, { ...EXEC, method: "POST", body: { route: "x" } })).status, 403);
  assert.strictEqual((await call(PL, { ...SSUP, method: "POST", body: {} })).status, 400);
  const l1 = await call(PL, SSUP);
  assert.deepStrictEqual(l1.json.routes.map((r) => r.name).sort(), ["خط الكلاكلة", "خط بحري"]); // car1 only (incl. the one from a competitor price)
  assert.deepStrictEqual(l1.json.locations, [{ name: "الكلاكلة صنقعت", salesRoute: "car1", deliveryRoute: "خط الكلاكلة" }]);
  assert.deepStrictEqual((await call(PL, R2)).json.routes.map((r) => r.name), ["خط أمبدة"]);
  assert.strictEqual((await call(PL, MGR2)).json.routes.length, 3);
  assert.strictEqual((await call(PL, EXEC)).status, 403);
  ok("routes and locations can be added without a client (sales staff for their type, manager for either); listed per sales type; no duplicates");

  // 7. competitor list window (?days=)
  await call(C, { ...SSUP, method: "POST", body: entry(20, { date: "2025-01-01" }) });
  const yr = await call(C, { ...EXEC });
  const all = await call(C, { ...EXEC, query: { days: "1100" } });
  assert.ok(!yr.json.entries.some((e) => e.date === "2025-01-01") && all.json.entries.some((e) => e.date === "2025-01-01"));
  assert.strictEqual((await call(C, { ...EXEC, query: { days: "1" } })).json.entries.every((e) => e.date === today), true);
  ok("competitor prices are read for a chosen window (default a year)");

  console.log("ALL COMPETITORS/ROUTE SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
