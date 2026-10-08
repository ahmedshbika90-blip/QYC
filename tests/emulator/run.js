// Tests against the REAL Firebase Emulator (Firestore + Auth), including
// the real firestore.rules — what the in-memory tests can't prove: real
// transactions under contention, real ID tokens and custom claims, and the
// security rules the browser is held to.
//
// Run (needs Java 11+):  npm run test:emulator
// CI runs it on every push (.github/workflows/ci.yml).
// Uses the offline "demo-mubashir" project — never touches real data.
const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../..");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Start it with:  npm run test:emulator  (sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST)");
  process.exit(1);
}
const PROJECT = process.env.GCLOUD_PROJECT || "demo-mubashir";
process.env.FIREBASE_PROJECT_ID = PROJECT;

const { adminDb, adminAuth } = require(path.join(ROOT, "lib/firebaseAdmin.js"));

let passed = 0;
const ok = (m) => console.log("PASS", ++passed + ":", m);

function load(rel) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, "utf8").replace(/export default async function handler/, "module.exports = async function handler");
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports;
}
async function call(rel, token, { method = "GET", query = {}, body } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  await h({ method, query, body, url: "/" + rel, headers: { authorization: `Bearer ${token}` } }, res);
  return { status, json };
}

// A real user in the Auth emulator with role claims, signed in for a real ID token.
async function staff(uid, claims) {
  const email = `${uid}@test.local`;
  await adminAuth.createUser({ uid, email, password: "secret-123" }).catch(() => {});
  await adminAuth.setCustomUserClaims(uid, claims);
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "secret-123", returnSecureToken: true }),
  });
  const d = await r.json();
  if (!d.idToken) throw new Error("emulator sign-in failed: " + JSON.stringify(d));
  return d.idToken;
}

async function clearFirestore() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

(async () => {
  await clearFirestore();

  // ---------- 1. security rules (the browser's only door) ----------
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
  const [fhost, fport] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: fhost, port: Number(fport), rules: fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc("meta/versions").set({ orders_car1: 1 });
    await d.doc("meta/clientIdCounter").set({ value: 1000 });
    await d.doc("orders/o1").set({ total: 100 });
    await d.doc("clients/1000").set({ name: "x", phone: "0912345678" });
    await d.doc("products/p1").set({ name: "p", avgCost: 10 });
  });
  const anon = env.unauthenticatedContext().firestore();
  const agent = env.authenticatedContext("a1", { role: "agent_car1" }).firestore();
  const exec = env.authenticatedContext("e1", { role: "executive" }).firestore();
  const noRole = env.authenticatedContext("x1", {}).firestore();
  await assertFails(anon.doc("meta/versions").get());
  await assertFails(noRole.doc("meta/versions").get());
  await assertSucceeds(agent.doc("meta/versions").get());
  await assertSucceeds(exec.doc("meta/versions").get());
  await assertFails(agent.doc("meta/versions").set({ orders_car1: 99 }));
  await assertFails(agent.collection("meta").get()); // can't list meta (clientIdCounter)
  await assertFails(agent.doc("meta/clientIdCounter").get());
  for (const p of ["orders/o1", "clients/1000", "products/p1", "dailyStats/2026-01-01", "competitorPrices/x", "places/x"]) {
    await assertFails(agent.doc(p).get());
    await assertFails(exec.doc(p).get());
    await assertFails(agent.doc(p).set({ hacked: true }));
  }
  await env.cleanup();
  await clearFirestore();
  ok("firestore.rules: only staff with a role may read meta/versions (read-only, no listing); every business collection is closed to the browser");

  // ---------- 2. real tokens through the API ----------
  const sup = await staff("sup1", { role: "agent_car1", salesSupervisor: true });
  const mgr = await staff("mgr1", { role: "manager" });
  const ex = await staff("exe1", { role: "executive" });
  assert.strictEqual((await call("pages/api/places.js", "not-a-token")).status, 401);
  assert.strictEqual((await call("pages/api/places.js", ex)).status, 403);
  assert.strictEqual((await call("pages/api/places.js", sup)).status, 200);
  ok("real Firebase ID tokens: bad token 401, wrong role 403, right role 200");

  // ---------- 3. stock under real transaction contention ----------
  await adminDb.doc("products/p1").set({ name: "طحنية", unit: "كرتونة", active: true, prices: { car1: 1000, car2: 1100 }, stock: { depot: 0, car1: 5, car2: 0 }, avgCost: 600 });
  const reg = await call("pages/api/clients/register.js", sup, { method: "POST", body: { nameFirst: "أ", nameMiddle: "ب", nameLast: "ج", storeName: "S", deliveryRoute: "خط", location: "L", phone: "0911111111", storeClass: "A", requestId: "req-emu-client-0001" } });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.json));
  const clientId = reg.json.clientId;
  const inv = (n, qty) => call("pages/api/orders/create-staff.js", sup, { method: "POST", body: { clientId, items: [{ productId: "p1", qty }], requestId: `req-emu-order-000${n}` } });
  // Two invoices of 4 at the same moment with only 5 in the van: exactly one may succeed.
  const both = await Promise.all([inv(1, 4), inv(2, 4)]);
  const statuses = both.map((r) => r.status).sort();
  assert.deepStrictEqual(statuses, [201, 400], JSON.stringify(both.map((r) => r.json)));
  assert.strictEqual((await adminDb.doc("products/p1").get()).data().stock.car1, 1);
  // The same request sent twice (weak connection) is stored once.
  const won = both.find((r) => r.status === 201);
  const again = await call("pages/api/orders/create-staff.js", sup, { method: "POST", body: { clientId, items: [{ productId: "p1", qty: 4 }], requestId: won.json.orderId } });
  assert.ok(again.json.duplicate || again.status === 200, JSON.stringify(again.json));
  assert.strictEqual((await adminDb.doc("products/p1").get()).data().stock.car1, 1);
  ok("two invoices racing for the last stock: one succeeds, one is refused, stock never goes negative; a resend is stored once");

  // ---------- 4. daily summaries match the invoices on real Firestore ----------
  const { rebuildDay } = require(path.join(ROOT, "lib/salesStats.js"));
  const { businessDay } = require(path.join(ROOT, "lib/businessDay.js"));
  const today = businessDay(new Date());
  const day = (await adminDb.doc(`dailyStats/${today}`).get()).data();
  assert.strictEqual(day.r.car1.inv, 1);
  assert.strictEqual(day.r.car1.units, 4);
  assert.strictEqual((await rebuildDay(today)).diffs.length, 0);
  const cancel = await call("pages/api/orders/[id]/status.js", sup, { method: "PATCH", query: { id: won.json.orderId }, body: { status: "cancelled" } });
  assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.json));
  assert.strictEqual((await rebuildDay(today)).diffs.length, 0);
  assert.strictEqual((await adminDb.doc("products/p1").get()).data().stock.car1, 5);
  ok("daily summary written in the invoice transaction and still exact after a cancellation (real Firestore)");

  // ---------- 5. a disabled account is refused even with a valid token ----------
  await adminAuth.updateUser("mgr1", { disabled: true });
  assert.strictEqual((await call("pages/api/places.js", mgr)).status, 401);
  ok("a disabled account is refused at once, even though its token hasn't expired");

  console.log("ALL EMULATOR SCENARIOS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
