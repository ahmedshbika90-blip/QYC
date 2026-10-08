const { adminDb } = require("../../../lib/firebaseAdmin");
const { rebuildDay, rebuildMonth } = require("../../../lib/salesStats");
const { runStockCheck } = require("../../../lib/stockCheck");
const { bumpVersions } = require("../../../lib/versions");
const { businessDay } = require("../../../lib/businessDay");
const { reportServerError } = require("../../../lib/monitor");

// The nightly job (Vercel cron, vercel.json — one job keeps within the
// free plan's limit):
//   1. recompute yesterday's sales summaries and invoice logs from the raw
//      invoices and repair any drift (same as /api/cron/verify-stats)
//   2. stock check: every balance = starting point + movements; differences
//      are reported to the manager, never corrected
// Needs CRON_SECRET (Vercel sends it as "Authorization: Bearer …").
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET is not set" });
  if ((req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  const out = {};
  try {
    const day = businessDay(new Date(Date.now() - 24 * 3600e3));
    const d = await rebuildDay(day, { write: true });
    const m = await rebuildMonth(day.slice(0, 7), { write: true });
    const repaired = d.diffs.length > 0 || m.diffs.length > 0;
    const at = new Date().toISOString();
    await adminDb.collection("meta").doc("statsCheck").set({ at, day, invoices: d.invoices, repaired, dayFields: d.diffs.length, monthFields: m.diffs.length });
    if (repaired) await adminDb.collection("statsDrift").doc(`${day}_${at.replace(/[:.]/g, "-")}`).set({ day, at, dayDiffs: d.diffs.slice(0, 100), monthDiffs: m.diffs.slice(0, 100) });
    out.stats = { day, repaired, fields: d.diffs.length + m.diffs.length };
  } catch (err) {
    reportServerError(err, req);
    out.stats = { error: "failed" };
  }
  try {
    const s = await runStockCheck();
    await bumpVersions(["stockCheck"]);
    out.stock = { ok: s.ok, baseline: !!s.baseline, differences: s.diffs.length, movements: s.movements };
  } catch (err) {
    reportServerError(err, req);
    out.stock = { error: "failed" };
  }
  return res.status(out.stats.error || out.stock.error ? 500 : 200).json(out);
}
