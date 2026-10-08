const { requireUser, requireRole, sendError } = require("../../../../lib/apiAuth");
const { listAccounts, createAccount } = require("../../../../lib/adminUsers");
const { reportServerError } = require("../../../../lib/monitor");

// Admin only.
//   GET  /api/admin/users   → every staff account with its role
//   POST /api/admin/users   { email, password, displayName?, role? } → new account
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["admin"]);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") return res.status(200).json({ users: await listAccounts() });
    if (req.method === "POST") return res.status(201).json({ user: await createAccount(decoded, req.body || {}) });
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
