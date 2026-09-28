const assert = require("assert");
const src = require("fs").readFileSync(require("path").join(__dirname, "run.js"), "utf8");
const header = src.slice(0, src.indexOf("(async () => {"));
eval(header + `
(async () => {
  await db.collection("products").doc("p1").set({ name: "Tahini", unit: "ctn", active: true, prices: { car1: 10 }, stock: { depot: 50, car1: 0, car2: 0 } });
  const WK = { role: "warehouse_keeper", uid: "wk" };
  const mv = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 10 }], requestId: "req-load-00000001" } });
  assert.strictEqual(mv.status, 201, JSON.stringify(mv.json));
  const mv2 = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 10 }], requestId: "req-load-00000001" } });
  assert.ok(mv2.json.duplicate);
  await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: "req-load-00000001" }, body: { action: "confirm" } });
  const again = await call("pages/api/inventory/[id]/confirm.js", { method: "PATCH", ...A1, query: { id: "req-load-00000001" }, body: { action: "confirm" } });
  assert.strictEqual(again.status, 200);
  const st = (await get("products", "p1")).stock;
  assert.deepStrictEqual([st.depot, st.car1], [40, 10]);
  ok("loading: duplicate doc prevented, double confirm moves stock once (depot 50→40, car 0→10)");

  const body = { name: "New Store", storeName: "NS", location: "Souq", phone: "0912345678", storeClass: "A", requestId: "req-client-000001" };
  const a = await call("pages/api/clients/register.js", { method: "POST", ...A1, body });
  const b = await call("pages/api/clients/register.js", { method: "POST", ...A1, body });
  assert.strictEqual(a.status, 201, JSON.stringify(a.json)); assert.ok(b.json.duplicate);
  assert.strictEqual(a.json.clientId, b.json.clientId);
  assert.strictEqual(Object.keys(db._data.clients).length, 1);
  assert.strictEqual((await get("meta", "clientIdCounter")).value, 1000);
  ok("client registration: repeat returns same client " + a.json.clientId + ", no wasted ID");
  // 3. Daily sequence numbering: independent per car, per type, per day.
  // Reads the actual starting point first — an earlier test in this file
  // already created one car1/loading document, so the counter isn't
  // necessarily at zero; what matters is that it counts up correctly and
  // stays independent per (car, type) from wherever it currently is.
  const car1LoadStart = (await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car1", type: "loading" } })).json.next;
  const car1OffStart = (await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car1", type: "offloading" } })).json.next;
  const car2LoadStart = (await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car2", type: "loading" } })).json.next;

  const l1 = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 1 }], requestId: "req-seq-00000001" } });
  const l2 = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 1 }], requestId: "req-seq-00000002" } });
  const off1 = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "offloading", route: "car1", items: [{ productId: "p1", qty: 1 }], requestId: "req-seq-00000003" } });
  const otherCar = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car2", items: [{ productId: "p1", qty: 1 }], requestId: "req-seq-00000004" } });
  assert.deepStrictEqual([l1.json.dailySeq, l2.json.dailySeq], [car1LoadStart, car1LoadStart + 1]);
  assert.strictEqual(off1.json.dailySeq, car1OffStart); // offloading counted separately from loading
  assert.strictEqual(otherCar.json.dailySeq, car2LoadStart); // car2 counted separately from car1
  const dup = await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 1 }], requestId: "req-seq-00000001" } });
  assert.strictEqual(dup.json.dailySeq, car1LoadStart); // repeat returns the original number, doesn't consume a new one
  const nxt = await call("pages/api/inventory/next-seq.js", { ...WK, query: { route: "car1", type: "loading" } });
  assert.strictEqual(nxt.json.next, car1LoadStart + 2);
  ok("daily sequence counts up correctly, stays independent per car+type, repeat doesn't burn a number");

  // 4. Version counters bump on real changes only — this is what drives
  // near-live updates (lib/useLiveRefresh.js) without opening Firestore to
  // the browser.
  const v0 = (await call("pages/api/versions.js", SUP)).json.versions;
  // Reuses the client "a" registered earlier in this file (route car1) —
  // client "1000" doesn't exist in THIS file's database (it belongs to
  // run.js's separate one), so using it here would silently 404.
  const ord = await call("pages/api/orders/create-staff.js", { method: "POST", ...A1, body: { clientId: a.json.clientId, items: [{ productId: "p1", qty: 1 }], requestId: "req-ver-00000001" } });
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  const v1 = (await call("pages/api/versions.js", SUP)).json.versions;
  assert.strictEqual(v1.orders_car1, v0.orders_car1 + 1);
  assert.strictEqual(v1.requests, v0.requests); // unrelated area untouched
  await call("pages/api/inventory/movement.js", { method: "POST", ...WK, body: { type: "loading", route: "car1", items: [{ productId: "p1", qty: 1 }], requestId: "req-ver-00000002" } });
  const v2 = (await call("pages/api/versions.js", SUP)).json.versions;
  assert.strictEqual(v2.inventory, v0.inventory + 1);
  ok("version counters bump only their own area, so polling clients refetch only what actually changed");

  console.log("ALL EXTRA SCENARIOS PASSED");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
`);
