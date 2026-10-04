const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { PERIOD_IDS, buildSummary } = require("../../../lib/dashboardSummary");

// Supervisor-only operations summary for the home dashboard:
//   GET /api/dashboard/summary?period=today|yesterday|wtd|mtd|all
// Everything the page draws comes from this one response, so the sections
// can never disagree with each other. It carries margin and prices-derived
// figures, which is why only the supervisor may call it.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);
    const period = String(req.query.period || "today");
    if (!PERIOD_IDS.includes(period)) {
      return res.status(400).json({ error: "فترة غير صالحة" });
    }
    return res.status(200).json(await buildSummary(period));
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
