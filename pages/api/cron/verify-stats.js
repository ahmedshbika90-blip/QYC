const { adminDb } = require("../../../lib/firebaseAdmin");
const { rebuildDay, rebuildMonth } = require("../../../lib/salesStats");
const { businessDay } = require("../../../lib/businessDay");
const { reportServerError } = require("../../../lib/monitor");

// Nightly check of the daily summaries (Vercel cron, see vercel.json):
// recomputes YESTERDAY (Khartoum) from the raw invoices, compares it with
// dailyStats/{day}, and repairs the day and its month if they drifted.
// Every run is recorded in meta/statsCheck; a repair also leaves a record
// in statsDrift so it can be looked into.
//
//   GET /api/cron/verify-stats            (Vercel sends Authorization: Bearer $CRON_SECRET)
//   GET /api/cron/verify-stats?day=YYYY-MM-DD   check a specific day (same header)
//
// Does nothing unless CRON_SECRET is set in the environment.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET is not set" });
  if ((req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  try {
    const asked = String(req.query.day || "");
    const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : businessDay(new Date(Date.now() - 24 * 3600e3));
    const d = await rebuildDay(day, { write: true });
    const m = await rebuildMonth(day.slice(0, 7), { write: true });
    const repaired = d.diffs.length > 0 || m.diffs.length > 0;
    const at = new Date().toISOString();
    const record = { at, day, invoices: d.invoices, repaired, dayFields: d.diffs.length, monthFields: m.diffs.length };
    await adminDb.collection("meta").doc("statsCheck").set(record);
    if (repaired) {
      await adminDb.collection("statsDrift").doc(`${day}_${at.replace(/[:.]/g, "-")}`).set({ ...record, dayDiffs: d.diffs.slice(0, 100), monthDiffs: m.diffs.slice(0, 100) });
      console.warn(`[verify-stats] ${day}: repaired ${d.diffs.length} day field(s), ${m.diffs.length} month field(s)`);
    }
    return res.status(200).json({ repaired, days: [{ day, invoices: d.invoices, fields: d.diffs.length }], month: { month: m.month, fields: m.diffs.length } });
  } catch (err) {
    reportServerError(err, req, res);
    console.error(err);
    return res.status(500).json({ error: "verify-stats failed" });
  }
}
