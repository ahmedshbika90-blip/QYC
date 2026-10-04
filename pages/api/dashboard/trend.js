const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { buildTrend } = require("../../../lib/dashboardSummary");

// Units sold over time for the dashboard's trend chart:
//   GET /api/dashboard/trend?bucket=day|week|month
// day = last 30 days, week = last 12 weeks (from Saturday), month = last
// 12 months. Paid units only, split wholesale / retail. Supervisor only.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);
    return res.status(200).json(await buildTrend(String(req.query.bucket || "day")));
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}
