/**
 * Test data for the STAGING project — fill or clear in one command.
 * Always uses .env.staging and refuses any project whose id doesn't contain
 * "staging", so it can never touch production.
 *
 *   node scripts/staging/data.js fill  [--months=6] [--trend=growing] [--volume=normal] [--seed=7]
 *   node scripts/staging/data.js clear
 *
 *   --months   1–24 months of history ending today                  (default 4)
 *   --trend    growing | flat | declining | seasonal | spike         (default growing)
 *   --volume   low | normal | high | veryhigh, or a number like 1.5 (default normal)
 *   --seed     any number — same seed + options = the same data again
 *
 * fill = clear + generate (invoices, payments on logs, refunds-ready data,
 * warehouse history, competitor prices, client balances, summaries) and
 * aligns product stock with the generated history.
 */
const path = require("path");
const fs = require("fs");
process.env.ENV_FILE = ".env.staging";
const envPath = path.join(__dirname, "..", "..", ".env.staging");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.staging next to package.json.");
  process.exit(1);
}
const project = require("dotenv").parse(fs.readFileSync(envPath)).FIREBASE_PROJECT_ID || "";
if (!/staging/i.test(project)) {
  console.error(`Refused: .env.staging points to "${project}", which isn't a staging project.`);
  process.exit(1);
}
const [cmd, ...rest] = process.argv.slice(2);
if (!["fill", "clear"].includes(cmd)) {
  console.error("Usage: node scripts/staging/data.js fill [--months=6] [--trend=growing|flat|declining|seasonal|spike] [--volume=low|normal|high|veryhigh]\n       node scripts/staging/data.js clear");
  process.exit(1);
}
const argv = ["--run", `--confirm=${project}`, ...(cmd === "clear" ? ["--clear"] : ["--reset-stock", ...rest])];
require("../demo/seed").main(argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
