const { requireUser, requireRole, sendError } = require("../../../../lib/apiAuth");
const { updateAccount } = require("../../../../lib/adminUsers");
const { reportServerError } = require("../../../../lib/monitor");

// Admin only.
//   PATCH /api/admin/users/:uid  { role?, displayName?, disabled?, password? }
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["admin"]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ user: await updateAccount(decoded, String(req.query.uid || ""), req.body || {}) });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
