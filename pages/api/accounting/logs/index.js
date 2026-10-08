const { requireUser, requireRole, sendError } = require("../../../../lib/apiAuth");
const { listLogs, period, sumLogs, agentsDirectory } = require("../../../../lib/accountingViews");
const { reportServerError } = require("../../../../lib/monitor");

// Accountant: invoice logs (one per van per day) in a period.
//   GET /api/accounting/logs?from=YYYY-MM-DD&to=YYYY-MM-DD&route=car1
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    const p = period(req.query);
    const route = req.query.route && req.query.route !== "all" ? String(req.query.route) : null;
    const [logs, agents] = await Promise.all([listLogs({ ...p, route }), agentsDirectory()]);
    return res.status(200).json({ period: p, logs, totals: sumLogs(logs), agents });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
