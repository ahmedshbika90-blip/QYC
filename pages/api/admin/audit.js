const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { recentAudit } = require("../../../lib/adminUsers");
const { reportServerError } = require("../../../lib/monitor");

// Admin only: the last account changes (who changed what, when).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["admin"]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ entries: await recentAudit(30) });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
