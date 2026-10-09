const { requireUser, requireRole, sendError } = require("../../../../lib/apiAuth");
const { clientBalances } = require("../../../../lib/accountingClients");
const { reportServerError } = require("../../../../lib/monitor");

// Accountant: clients with what they owe and its age.  GET ?route=car1&all=1
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    return res.status(200).json(await clientBalances({ route: req.query.route ? String(req.query.route) : null, all: req.query.all === "1" }));
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
