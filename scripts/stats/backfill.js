/**
 * Builds the daily sales summaries (dailyStats / monthlyStats), the invoice
 * log totals and the client balances from the existing invoices and
 * payments, then switches the dashboards over to them.
 *
 *   node scripts/stats/backfill.js                                → dry run: counts and differences, writes nothing
 *   node scripts/stats/backfill.js --run --confirm=<project-id>   → build every day and month, then mark ready
 *   node scripts/stats/backfill.js --run --confirm=<project-id> --from=2026-01-01 --to=2026-03-31
 *                                                                  → rebuild only those days (no "ready" change)
 *
 * Reads every invoice once (one read each, plus one per day and month
 * document). Each day is rebuilt in its own transaction that reads that
 * day's invoices, so invoices saved while it runs are never lost: the
 * day simply retries. Safe to run again at any time — a day that already
 * matches is left untouched.
 *
 * Until it has run (meta/statsState.ready), the dashboards keep using the
 * old invoice-by-invoice calculation, so deploying first is safe.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

async function main() {
  const { adminDb } = require("../../lib/firebaseAdmin");
  const { rebuildRange, firstInvoiceDay, markReady } = require("../../lib/salesStats");
  const { rebuildClientBalances } = require("../../lib/clientLedger");
  const { businessDay } = require("../../lib/businessDay");
  const project = process.env.FIREBASE_PROJECT_ID;
  const write = Boolean(args.run);
  if (write && args.confirm !== project) {
    console.error(`\nRefusing to write: add --confirm=${project} (the project in .env.local).\n`);
    process.exit(1);
  }
  const first = args.from || (await firstInvoiceDay());
  if (!first) {
    console.log("No invoices yet — nothing to build.");
    if (write && !args.from) await markReady({ source: "backfill", invoices: 0 });
    return;
  }
  const last = args.to || businessDay(new Date());
  console.log(`\nFirebase project: ${project}`);
  console.log(`Days: ${first} → ${last}  (${write ? "WRITING" : "dry run — nothing is written"})\n`);

  let n = 0;
  const result = await rebuildRange(first, last, {
    write,
    onDay: (d) => {
      n += 1;
      if (d.diffs.length) console.log(`  ${d.day}  ${String(d.invoices).padStart(4)} invoices  ${write ? "rebuilt" : "differs"} (${d.diffs.length} field(s))`);
      else if (n % 30 === 0) console.log(`  … ${d.day}`);
    },
  });
  console.log(`\n${result.days} days, ${result.invoices} invoices.`);
  // Client balances (statements, ageing) from all invoices and payments.
  const cb = await rebuildClientBalances({ write });
  console.log(`Client balances: ${cb.clients} clients, ${cb.changed} ${write ? "written" : "would be written"}.`);
  console.log(`${result.daysWithDrift.length} day(s) and ${result.monthsWithDrift.length} month(s) ${write ? "written" : "would be written"}.`);
  if (write && !args.from && !args.to) {
    await markReady({ source: "backfill", from: first, to: last, invoices: result.invoices });
    console.log("Dashboards now read the daily summaries (meta/statsState.ready = true).\n");
  } else if (!write) {
    const state = await adminDb.collection("meta").doc("statsState").get();
    console.log(`Dashboards currently use: ${state.exists && state.data().ready ? "daily summaries" : "raw invoices (not backfilled yet)"}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
