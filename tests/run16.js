// Phase 3 safety: error reports leave no personal data, App Check modes,
// two-step login enforcement for admin / manager / accountant.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, headers = {}, ...claims } = {}) {
  const h = load(rel);
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, url: "/" + rel, headers: { authorization: t, ...headers } }, res);
  return { status, json };
};
const MGR = { role: "manager", uid: "m" };
const ACC = { role: "accountant", uid: "acc" };
const W = { role: "agent_car1", uid: "w" };

(async () => {
  // 1. scrubbing
  const { scrubText, scrubEvent } = require("../lib/scrub");
  assert.strictEqual(scrubText("العميل «أحمد علي» 0912345678 +249912345678 x@y.com"), "العميل «…» [phone] [phone] [email]");
  const ev = scrubEvent({
    user: { id: "u1", email: "a@b.c" }, server_name: "host",
    request: { url: "https://app/api/clients/list?since=x&clientId=1000", query_string: "since=x", data: { phone: "0912345678" }, headers: { authorization: "Bearer t" }, cookies: { a: 1 } },
    exception: { values: [{ value: "duplicate phone 0123456789 for «سعاد»" }] },
    breadcrumbs: [{ category: "console", message: "x" }, { category: "ui.input", message: "typed" }, { category: "fetch", data: { url: "/api/orders?ref=4417", method: "GET", status_code: 500 } }],
    extra: { body: "x" },
  });
  assert.deepStrictEqual(ev, { request: { url: "https://app/api/clients/list" }, exception: { values: [{ value: "duplicate phone [phone] for «…»" }] }, breadcrumbs: [{ category: "fetch", message: "", data: { url: "/api/orders", method: "GET", status_code: 500 } }] });
  ok("error reports: no user, body, headers, cookies, query strings, typed text, names, phones or emails");

  // 2. server reports (Sentry mocked): only 500s, only with SENTRY_DSN, response waits for the send
  const sent = [];
  let initOpts = null;
  const fake = { init: (o) => (initOpts = o), withScope: (fn) => fn({ setTag: () => {} }), captureException: (e) => sent.push(e.message), flush: () => new Promise((r) => setTimeout(() => r(true), 20)) };
  require.cache[require.resolve("@sentry/nextjs")] = { id: "sentry", filename: "sentry", loaded: true, exports: fake };
  delete require.cache[require.resolve("../lib/monitor")];
  let M = require("../lib/monitor");
  M.reportServerError(new Error("boom"), { url: "/api/x" });
  assert.deepStrictEqual(sent, []); // no DSN → nothing
  process.env.SENTRY_DSN = "https://k@o0.ingest.sentry.io/1";
  delete require.cache[require.resolve("../lib/monitor")];
  M = require("../lib/monitor");
  const notFound = new Error("غير موجود"); notFound.statusCode = 404;
  M.reportServerError(notFound, { url: "/api/x" });
  let ended = false;
  const res = { end: () => { ended = true; } };
  M.reportServerError(new Error("database down"), { url: "/api/x?y=1", method: "GET" }, res);
  assert.deepStrictEqual(sent, ["database down"]);
  assert.strictEqual(initOpts.sendDefaultPii, false); assert.strictEqual(initOpts.beforeSend, scrubEvent);
  res.end(); assert.strictEqual(ended, false); await new Promise((r) => setTimeout(r, 40)); assert.strictEqual(ended, true);
  delete process.env.SENTRY_DSN;
  // every API route reports from its catch block
  const fs = require("fs"), path = require("path");
  const walk = (d) => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
  const silent = walk(path.join(ROOT, "pages/api")).filter((f) => !fs.readFileSync(f, "utf8").includes("reportServerError("));
  assert.deepStrictEqual(silent.map((f) => path.relative(ROOT, f)), []);
  ok("Sentry: off without SENTRY_DSN; only real server faults; scrubbed; the reply waits until it's sent; every API route reports");

  // 3. App Check
  const fb = require(path.join(ROOT, "lib/firebaseAdmin.js"));
  fb.admin.appCheck = () => ({ verifyToken: async (t) => { if (t !== "good-token") throw new Error("bad"); return { token: { exp: Math.floor(Date.now() / 1000) + 3600 } }; } });
  await db.collection("places").doc("car1__route__خط").set({ kind: "route", name: "خط", salesRoute: "car1" });
  const P = "pages/api/places.js";
  assert.strictEqual((await call(P, W)).status, 200); // off by default
  process.env.APP_CHECK = "monitor";
  const warn = console.warn; let warned = 0; console.warn = () => warned++;
  assert.strictEqual((await call(P, W)).status, 200);
  console.warn = warn;
  assert.strictEqual(warned, 1);
  process.env.APP_CHECK = "enforce";
  const refused = await call(P, W);
  assert.strictEqual(refused.status, 403);
  assert.strictEqual((await call(P, { ...W, headers: { "x-firebase-appcheck": "forged" } })).status, 403);
  assert.strictEqual((await call(P, { ...W, headers: { "x-firebase-appcheck": "good-token" } })).status, 200);
  delete process.env.APP_CHECK;
  ok("App Check: off by default; monitor logs but lets through; enforce refuses missing or forged tokens");

  // 4. two-step login
  const L = "pages/api/places.js";
  assert.strictEqual((await call(L, MGR)).status, 200); // not required yet
  process.env.REQUIRE_2FA = "1";
  const no2 = await call(L, MGR);
  assert.strictEqual(no2.status, 403);
  assert.ok(/التحقق بخطوتين/.test(no2.json.error));
  assert.strictEqual((await call(L, { ...MGR, firebase: { sign_in_second_factor: "totp" } })).status, 200);
  assert.strictEqual((await call("pages/api/accounting/invoices.js", ACC)).status, 403);
  assert.strictEqual((await call(L, W)).status, 200); // sales staff aren't required
  delete process.env.REQUIRE_2FA;
  const { MFA_ROLES } = require("../lib/mfa");
  assert.deepStrictEqual(MFA_ROLES, ["admin", "manager", "accountant"]);
  ok("two-step login: when required, admin/manager/accountant requests need a login completed with the code; others unaffected");

  console.log("ALL PHASE-3 SAFETY SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
