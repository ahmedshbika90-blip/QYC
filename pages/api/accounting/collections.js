const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { collections } = require("../../../lib/accountingClients");
const { reportServerError } = require("../../../lib/monitor");

// Accountant: money received by transfer date.  GET ?from=&to=&route=
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    return res.status(200).json(await collections({ from: String(req.query.from || ""), to: String(req.query.to || ""), route: req.query.route ? String(req.query.route) : null }));
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
