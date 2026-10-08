const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { buildSummary } = require("../../../lib/dashboardSummary");
const { reportServerError } = require("../../../lib/monitor");

// Supervisor-only operations summary for a range of days (Sudan calendar):
//   GET /api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD   (default: today)
// Every section of the dashboard is drawn from this one response, so the
// sections can never disagree. It carries margin, hence supervisor only.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);
    const { from, to } = req.query;
    return res.status(200).json(await buildSummary({ from: from ? String(from) : undefined, to: to ? String(to) : undefined }));
  } catch (err) {
    reportServerError(err, req, res);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}
