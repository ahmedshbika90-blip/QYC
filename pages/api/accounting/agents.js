const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { agentsOverview } = require("../../../lib/accountingViews");
const { reportServerError } = require("../../../lib/monitor");

// Accountant: every agent's position (all time + the period) and the two together.
//   GET /api/accounting/agents?from=&to=
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    return res.status(200).json(await agentsOverview(req.query));
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
