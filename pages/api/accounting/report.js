const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { reportData } = require("../../../lib/accountingViews");
const { reportServerError } = require("../../../lib/monitor");

// Accountant report: one agent or all, a period — logs per day, totals, payments.
//   GET /api/accounting/report?from=&to=&route=car1|car2|all
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    return res.status(200).json(await reportData(req.query));
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
