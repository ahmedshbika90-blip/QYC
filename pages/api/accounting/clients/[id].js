const { requireUser, requireRole, sendError } = require("../../../../lib/apiAuth");
const { clientStatement } = require("../../../../lib/accountingClients");
const { reportServerError } = require("../../../../lib/monitor");

// Accountant: one client's statement (كشف حساب).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    return res.status(200).json(await clientStatement(req.query.id));
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
