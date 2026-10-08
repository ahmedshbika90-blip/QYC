/**
 * Gives every existing invoice its legal number (INV-YYYY-000001…) in the
 * order it was created, per year, then switches numbering on so every new
 * invoice gets the next number automatically.
 *
 *   node scripts/invoices/number-existing.js                               → dry run (counts per year)
 *   node scripts/invoices/number-existing.js --run --confirm=<project-id>  → number them and switch on
 *
 * Safe to run while the app is in use; if invoices arrive while it runs it
 * asks you to run it again. Reads every invoice once.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env.local") });
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v === undefined ? true : v]; }));

(async () => {
  const { numberExisting } = require("../../lib/invoiceNumbers");
  const project = process.env.FIREBASE_PROJECT_ID;
  const write = Boolean(args.run);
  if (write && args.confirm !== project) {
    console.error(`Refusing to write: add --confirm=${project}`);
    process.exit(1);
  }
  console.log(`\nFirebase project: ${project} (${write ? "WRITING" : "dry run"})`);
  const r = await numberExisting({ write, onProgress: (n) => process.stdout.write(`\r  numbered ${n}…`) });
  if (r.alreadyEnabled) return console.log("Numbering is already on — nothing to do.\n");
  console.log(`\n${write ? "Numbered" : "Would number"} ${r.numbered} invoice(s):`, r.byYear);
  console.log(write ? "Numbering is now ON for new invoices.\n" : "Add --run --confirm=" + project + " to do it.\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
