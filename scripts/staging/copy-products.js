/**
 * Copies the PRODUCTS (names, units, categories, prices, average costs)
 * from production (.env.local) into the staging project (.env.staging), so
 * the demo data is built on the real catalogue. Production is only READ.
 *
 *   node scripts/staging/copy-products.js                                   → dry run
 *   node scripts/staging/copy-products.js --run --confirm=<staging-project-id>
 *
 * Stock is copied too (use the seed's --reset-stock afterwards to align it
 * with the demo history).
 */
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const admin = require("firebase-admin");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v === undefined ? true : v]; }));
const root = path.join(__dirname, "..", "..");
function appFrom(file, name) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) throw new Error(`Missing ${file}`);
  const env = dotenv.parse(fs.readFileSync(p));
  const app = admin.initializeApp(
    { credential: admin.credential.cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) },
    name
  );
  return { db: app.firestore(), project: env.FIREBASE_PROJECT_ID };
}

(async () => {
  const prod = appFrom(".env.local", "prod");
  const stg = appFrom(".env.staging", "staging");
  if (prod.project === stg.project) throw new Error("Both files point to the same project — refusing.");
  console.log(`\nFrom (read only): ${prod.project}\nTo:               ${stg.project}`);
  const snap = await prod.db.collection("products").get();
  console.log(`Products found: ${snap.size}`);
  snap.docs.forEach((d) => console.log(`  - ${d.data().name}`));
  if (!args.run) return console.log(`\nDry run. Add --run --confirm=${stg.project} to copy.\n`);
  if (args.confirm !== stg.project) {
    console.error(`Refusing: add --confirm=${stg.project}`);
    process.exit(1);
  }
  const batch = stg.db.batch();
  snap.docs.forEach((d) => batch.set(stg.db.collection("products").doc(d.id), { ...d.data(), copiedFromProductionAt: new Date().toISOString() }));
  await batch.commit();
  console.log(`\nCopied ${snap.size} products to ${stg.project}.\n`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
