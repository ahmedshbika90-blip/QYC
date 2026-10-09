/**
 * Demo data for presentations — wipes the business data and fills the
 * system with realistic sales history.
 *
 *   node scripts/demo/seed.js                                  → dry run: shows what would happen
 *   node scripts/demo/seed.js --run --confirm=<firebase-project-id> [--months=4] [--seed=2026]
 *
 * USES YOUR PRODUCTS: every active product that has both a wholesale and
 *          a retail price, with its real names, prices and cost. Products
 *          are NOT changed (add --reset-stock to set their stock to where
 *          the demo history ends).
 * DELETES: invoices, clients, warehouse documents, shipping and change
 *          requests, transfers, payments, audit log, counters (and sample
 *          products from an earlier demo run, marked demo: true).
 * KEEPS:   your products and prices, staff accounts, roles, names, photos.
 * WRITES:  ~65 clients, months of invoices (with legal numbers), payments
 *          recorded on invoice logs and split over their invoices, open
 *          logs for the last days, receipts/loadings, daily summaries,
 *          competitor prices, saved routes/locations — every document
 *          marked demo: true. The stock check starts fresh (first run sets
 *          its starting point).
 *
 * Safety: nothing is written without --run AND --confirm equal to the
 * project id in .env.local, so it can't hit the wrong project by accident.
 * Best practice: run it on a separate demo Firebase project, or take a
 * backup first if it's the live one.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", process.env.ENV_FILE || ".env.local") }); // ENV_FILE=.env.staging for the test project
const { admin, adminAuth, adminDb } = require("../../lib/firebaseAdmin");
const { normalizeRole } = require("../../lib/roles");
const { generate } = require("./generate");

const WIPE = [
  "orders", "clients", "inventoryDocs", "shipmentRequests", "changeRequests", "clientRequests",
  "transfers", "invoicePayments", "paymentRefs", "auditLog", "dailyCounters", "sentReports", "rateLimits", "agentOpenShipment",
  "dailyStats", "monthlyStats", "logState", "logPayments", "places",
  "competitorPrices", "stockLedger", "stockChecks", "statsDrift", "clientBalance",
];
const META_RESET = ["clientIdCounter", "paymentRefsSearch", "paymentRefsSearch2", "invoiceNumbering", "stockCheckpoint", "stockCheck"];
const VERSION_KEYS = ["orders_car1", "orders_car2", "requests", "inventory", "clients", "shipmentRequests", "payments", "products", "competitors", "places", "stockCheck"];

const parseArgs = (argv) =>
  Object.fromEntries(
    argv.map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v === undefined ? true : v];
    })
  );
let args = parseArgs(process.argv.slice(2));

async function staffUids() {
  const out = {};
  let token;
  do {
    const page = await adminAuth.listUsers(1000, token);
    page.users.forEach((u) => {
      const role = normalizeRole(u.customClaims?.role);
      if (role && !out[role]) {
        out[role] = u.uid;
        if (role === "accountant") out.accountantEmail = u.email || null;
      }
    });
    token = page.pageToken;
  } while (token);
  return out;
}

async function count(name) {
  return (await adminDb.collection(name).count().get()).data().count;
}

async function main(argv) {
  if (argv) args = parseArgs(argv);
  const project = process.env.FIREBASE_PROJECT_ID;
  const months = Math.min(12, Math.max(1, Number(args.months) || 4));
  const seed = Number(args.seed) || 2026;
  console.log(`\nFirebase project: ${project}`);
  console.log(`Demo period: last ${months} month(s), seed ${seed}\n`);

  const uids = await staffUids();
  const prodSnap = await adminDb.collection("products").get();
  const real = prodSnap.docs.filter((d) => !d.data().demo && d.data().active !== false).map((d) => ({ id: d.id, ...d.data() }));
  const sampleProducts = prodSnap.docs.filter((d) => d.data().demo);
  const skipped = real.filter((p) => !(Number(p.prices?.car1) > 0 && Number(p.prices?.car2) > 0));
  if (!real.length) {
    console.error("No products found. Add your products (with wholesale and retail prices) first, then run this again.\n");
    process.exit(1);
  }
  const data = generate({ months, seed, uids, catalog: real });
  const writes = data.clients.length + data.orders.length + data.inventoryDocs.length + data.invoicePayments.length + data.paymentRefs.length + data.dailyStats.length + data.monthlyStats.length + data.logState.length + data.logPayments.length + data.places.length + data.competitorPrices.length + data.clientBalance.length;

  console.log("Will DELETE:");
  for (const name of WIPE) console.log(`  ${name.padEnd(18)} ${await count(name)} documents`);
  console.log(`  products           ${sampleProducts.length} sample products from an earlier demo run (yours are kept)`);
  console.log(`\nYour products used: ${data.productCount}`);
  real.filter((p) => !skipped.includes(p)).forEach((p) => console.log(`  • ${p.name} — wholesale ${p.prices.car1}, retail ${p.prices.car2}, cost ${p.avgCost ?? "not set"}`));
  if (skipped.length) console.log(`  (skipped — missing a wholesale or retail price: ${skipped.map((p) => p.name).join("، ")})`);
  console.log(args["reset-stock"] ? "  Stock will be SET to where the demo history ends." : "  Stock is left exactly as it is now (use --reset-stock to change it).");
  console.log("\nWill CREATE:");
  console.log(`  clients ${data.clients.length}, invoices ${data.orders.length},`);
  console.log(`  warehouse documents ${data.inventoryDocs.length}, invoice logs ${data.logState.length}`);
  console.log(`  payments on logs ${data.logPayments.length} (each split over its invoices), invoices with money received ${data.invoicePayments.length}`);
  console.log(`  competitor prices ${data.competitorPrices.length}, saved routes/locations ${data.places.length}`);
  console.log(`  period ${data.period.from} → ${data.period.to}  (~${writes} writes)`);
  console.log("\nSales agents / keeper / accountant found:", Object.keys(uids).filter((k) => k !== "accountantEmail").join(", ") || "none (placeholders used)");

  if (!args.run) {
    console.log("\nDry run only. To apply:\n  node scripts/demo/seed.js --run --confirm=" + project + (args.months ? ` --months=${months}` : "") + "\n");
    return;
  }
  if (args.confirm !== project) {
    console.error(`\nRefused: --confirm must equal the project id (${project}).\n`);
    process.exit(1);
  }

  console.log("\nDeleting…");
  for (const name of WIPE) await adminDb.recursiveDelete(adminDb.collection(name));
  await Promise.all(META_RESET.map((id) => adminDb.collection("meta").doc(id).delete()));
  await Promise.all(sampleProducts.map((d) => d.ref.delete()));

  console.log("Writing…");
  const bw = adminDb.bulkWriter();
  const put = (coll, list) => list.forEach(({ id, data: d }) => bw.set(adminDb.collection(coll).doc(id), d));
  if (args["reset-stock"]) {
    Object.entries(data.finalStock).forEach(([id, stock]) => bw.update(adminDb.collection("products").doc(id), { stock }));
  }
  put("clients", data.clients);
  put("orders", data.orders);
  put("inventoryDocs", data.inventoryDocs);
  put("invoicePayments", data.invoicePayments);
  put("paymentRefs", data.paymentRefs);
  put("dailyStats", data.dailyStats);
  put("monthlyStats", data.monthlyStats);
  put("logState", data.logState);
  put("logPayments", data.logPayments);
  put("places", data.places);
  put("competitorPrices", data.competitorPrices);
  put("clientBalance", data.clientBalance);
  bw.set(adminDb.collection("meta").doc("clientIdCounter"), { value: data.lastClientId });
  // Demo references already carry the last-4 search field; demo invoices
  // already have their daily summaries.
  bw.set(adminDb.collection("meta").doc("paymentRefsSearch2"), { doneAt: new Date().toISOString(), updated: 0 });
  bw.set(adminDb.collection("meta").doc("invoiceNumbering"), { enabled: true, at: new Date().toISOString(), source: "demo" });
  for (const [y, value] of Object.entries(data.invoiceCounters || {})) bw.set(adminDb.collection("meta").doc(`invoiceCounter_${y}`), { value });
  bw.set(adminDb.collection("meta").doc("statsState"), { ready: true, at: new Date().toISOString(), source: "demo" }, { merge: true });
  // Every open screen/device refreshes its cached lists.
  const inc = admin.firestore.FieldValue.increment(1);
  bw.set(adminDb.collection("meta").doc("versions"), Object.fromEntries(VERSION_KEYS.map((k) => [k, inc])), { merge: true });
  // (products version isn't tracked separately; the inventory bump refreshes stock views)
  await bw.close();

  console.log(`\nDone — ${writes} documents written for ${data.period.from} → ${data.period.to}.`);
  console.log("Ask users to refresh the app (or sign out and in) to see the new data.\n");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main };
