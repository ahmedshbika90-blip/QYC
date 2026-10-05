const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { buildOverview } = require("../../../lib/executiveSummary");

// Executive (and manager) — tab 1 of /executive. GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["executive", "manager"]);
    const { from, to } = req.query;
    return res.status(200).json(await buildOverview({ from: from ? String(from) : undefined, to: to ? String(to) : undefined }));
  } catch (err) {
    return sendError(res, err);
  }
}
