const { requireUser, sendError } = require("../../../lib/apiAuth");
const { removeEntry } = require("../../../lib/competitors");
const { bumpVersions } = require("../../../lib/versions");
const { reportServerError } = require("../../../lib/monitor");

// DELETE /api/competitors/:id — the sales supervisor who entered it, or the manager.
export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    await removeEntry(decoded, String(req.query.id || ""));
    await bumpVersions(["competitors"]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
