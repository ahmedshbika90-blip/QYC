// Staff-feedback fixes + company settings.
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
call = async function (rel, { method = "GET", query = {}, body, ...claims } = {}) {
  const h = load(rel); let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {}, end() {} };
  const t = "Bearer " + Buffer.from(JSON.stringify(claims)).toString("base64");
  await h({ method, query, body, url: "/" + rel, headers: { authorization: t } }, res); return { status, json };
};
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
(async () => {
  // 1. a negative margin is a figure, not an error: the error banner skips numbers
  assert.ok(read("components/ErrorSpotlight.js").includes("p.text-red-600:not(.num)"));
  assert.ok(read("components/TodayMargin.js").includes("data-no-spotlight"));
  await db.collection("meta").doc("statsState").set({ ready: true });
  await db.collection("products").doc("p1").set({ name: "x", active: true, prices: { car1: 500, car2: 500 }, stock: { depot: 0, car1: 50, car2: 50 }, avgCost: 900 });
  await db.collection("clients").doc("1000").set({ name: "c", route: "car1", active: true });
  const W = { role: "agent_car1", uid: "a", salesSupervisor: true };
  const inv = await call("pages/api/orders/create-staff.js", { ...W, method: "POST", body: { clientId: "1000", items: [{ productId: "p1", qty: 3 }], requestId: "req-neg-000000001" } });
  assert.strictEqual(inv.status, 201);
  for (const [rel, who] of [["pages/api/reports/sales.js", W], ["pages/api/reports/margin.js", { role: "manager", uid: "m" }], ["pages/api/dashboard/summary.js", { role: "manager", uid: "m" }], ["pages/api/accounting/agents.js", { role: "accountant", uid: "c" }], ["pages/api/accounting/report.js", { role: "accountant", uid: "c" }]]) {
    const r = await call(rel, who);
    assert.strictEqual(r.status, 200, rel + " " + JSON.stringify(r.json));
  }
  const ag = await call("pages/api/accounting/agents.js", { role: "accountant", uid: "c" });
  assert.ok(ag.json.agents.find((a) => a.route === "car1").period.margin < 0);
  ok("selling below cost: every margin screen answers normally with a negative figure, and it isn't flagged as an error");

  // 2. company settings in one place; currency stored on invoices and payments
  const C = require("../lib/companyConfig");
  assert.deepStrictEqual([C.TIME_ZONE, C.UTC_OFFSET, C.CURRENCY], ["Africa/Khartoum", "+02:00", "SDG"]);
  const scattered = ["pages", "components", "lib"].flatMap((d) => require("child_process").execSync("grep -rl 'Africa/Khartoum\\\\|+02:00' " + d + " || true", { cwd: ROOT }).toString().split("\\n").filter(Boolean)).filter((f) => !/companyConfig|i18nDict/.test(f));
  assert.deepStrictEqual(scattered, []);
  assert.strictEqual((await db.collection("orders").doc("req-neg-000000001").get()).data().currency, "SDG");
  const pay = await directPay({ role: "accountant", uid: "c" }, "req-neg-000000001", { ref: "9001", bank: "bok", amount: 100, date: new Date().toISOString().slice(0, 10), requestId: "req-neg-pay-00001" });
  assert.strictEqual(pay.status, 201, JSON.stringify(pay.json));
  assert.strictEqual(pay.json.payment.currency, "SDG");
  ok("company settings (time zone, currency, name) come from lib/companyConfig.js only; invoices and payments store their currency");

  // 3. sign-in prompt: a new sign-in on the same tab is a new "opening"
  const seenSrc = read("lib/notificationSeen.js");
  assert.ok(seenSrc.includes("newLoginSession") && read("pages/login.js").includes("newLoginSession()") && read("lib/useAuth.js").includes("newLoginSession()"));
  assert.ok(read("components/PendingActionModal.js").includes("loginSession()"));
  ok("the sign-in prompt is decided per sign-in, not once per page load");

  // 4. documents: one screen, a clear new-request button with a chooser, what needs you listed in طلباتي
  const panel = read("components/ShipmentRequestsPanel.js");
  assert.ok(!panel.includes('role="tablist"') && panel.includes("ماذا تريد أن تطلب؟") && panel.includes("بحاجة لإجراء منك") && panel.includes('bucket === "shipping"'));
  ok("documents: no sub-tabs; 'طلب جديد' asks shipping order or return; items behind the nav badge are listed in طلباتي");

  console.log("ALL FEEDBACK/SETTINGS SCENARIOS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
`);
