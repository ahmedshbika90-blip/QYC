const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { listVans, saveVan } = require("../../../lib/vans");
const { bumpVersions, getVersion } = require("../../../lib/versions");
const { reportServerError } = require("../../../lib/monitor");

// Vans (sales routes).
//   GET  → { vans, version }                any signed-in staff
//   POST { id?, newId?, label, type, active } admin only — add or edit a van
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    if (req.method === "GET") {
      const [vans, version] = await Promise.all([listVans(), getVersion("vans")]);
      return res.status(200).json({ vans, version });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
    requireRole(decoded, ["admin"]);
    const van = await saveVan(req.body || {});
    await bumpVersions(["vans"]);
    return res.status(200).json({ van });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
