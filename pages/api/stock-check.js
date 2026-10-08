const { requireUser, requireRole, sendError } = require("../../lib/apiAuth");
const { runStockCheck, acceptBalance, lastCheck } = require("../../lib/stockCheck");
const { bumpVersions } = require("../../lib/versions");
const { reportServerError } = require("../../lib/monitor");

// Manager: the stock check.
//   GET  → the latest result
//   POST { action: "run" }                              run it now
//   POST { action: "accept", productId, field? }       "this balance is right"
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);
    if (req.method === "GET") return res.status(200).json({ check: await lastCheck() });
    if (req.method !== "POST") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
    const body = req.body || {};
    if (body.action === "run") await runStockCheck();
    else if (body.action === "accept") {
      if (typeof body.productId !== "string" || !body.productId) return res.status(400).json({ error: "المنتج غير صالح" });
      await acceptBalance(body.productId, typeof body.field === "string" ? body.field : null, decoded.uid);
    } else return res.status(400).json({ error: "إجراء غير معروف" });
    await bumpVersions(["stockCheck"]);
    return res.status(200).json({ check: await lastCheck() });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
