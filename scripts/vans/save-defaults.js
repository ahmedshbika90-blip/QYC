/**
 * Writes the two original vans (car1 wholesale, car2 retail) into the
 * `vans` collection so they're visible in Firestore. Optional: the app
 * already treats them as existing; this only makes them explicit.
 *
 *   node scripts/vans/save-defaults.js                              → dry run
 *   node scripts/vans/save-defaults.js --run --confirm=<project-id>
 *
 * Uses .env.local, or the file named in ENV_FILE (e.g. ENV_FILE=.env.staging).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", process.env.ENV_FILE || ".env.local") });
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v === undefined ? true : v]; }));

(async () => {
  const { adminDb } = require("../../lib/firebaseAdmin");
  const { DEFAULT_VANS } = require("../../lib/vans");
  const { bumpVersions } = require("../../lib/versions");
  const project = process.env.FIREBASE_PROJECT_ID;
  console.log(`\nFirebase project: ${project}`);
  for (const v of DEFAULT_VANS) {
    const snap = await adminDb.collection("vans").doc(v.id).get();
    console.log(`  ${v.id}: ${snap.exists ? "already saved" : "not saved yet"}`);
  }
  if (!args.run) return console.log(`\nDry run. Add --run --confirm=${project} to save them.\n`);
  if (args.confirm !== project) {
    console.error(`Refusing: add --confirm=${project}`);
    process.exit(1);
  }
  const now = new Date().toISOString();
  for (const { id, ...v } of DEFAULT_VANS) {
    const ref = adminDb.collection("vans").doc(id);
    if (!(await ref.get()).exists) await ref.set({ ...v, createdAt: now, updatedAt: now });
  }
  await bumpVersions(["vans"]);
  console.log("Saved.\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
