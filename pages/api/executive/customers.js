const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { buildCustomers } = require("../../../lib/executiveSummary");
const { reportServerError } = require("../../../lib/monitor");

// Executive (and manager) — tab 2 of /executive. GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["executive", "manager"]);
    const { from, to } = req.query;
    return res.status(200).json(await buildCustomers({ from: from ? String(from) : undefined, to: to ? String(to) : undefined }));
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
