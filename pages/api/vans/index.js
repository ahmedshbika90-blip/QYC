const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { listVans, saveVan } = require("../../../lib/vans");
const { peopleByVan } = require("../../../lib/vanPeople");
const { bumpVersions, getVersion } = require("../../../lib/versions");
const { reportServerError } = require("../../../lib/monitor");

// Vans (sales routes).
//   GET  → { vans (with people: [{ name, supervisor }]), version }   any signed-in staff
//   POST { id?, newId?, label, type, active } admin only — add or edit a van
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    if (req.method === "GET") {
      const [vans, version, people] = await Promise.all([listVans(), getVersion("vans"), peopleByVan().catch(() => ({}))]);
      // each van with the names of the people assigned to it
      return res.status(200).json({ vans: vans.map((v) => ({ ...v, people: people[v.id] || [] })), version });
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
