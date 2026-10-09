const { adminDb } = require("../../lib/firebaseAdmin");
const { requireUser, requireRole, sendError } = require("../../lib/apiAuth");
const { requestAdjustment, decideAdjustment, listAdjustments } = require("../../lib/stockAdjustments");
const { bumpVersions } = require("../../lib/versions");
const { reportServerError } = require("../../lib/monitor");

// Stock adjustments (تسويات المخزون): damaged write-offs and free samples.
//   GET ?kind=&status=&from=&to=[&withDamage=1]   keeper, manager, accountant
//        withDamage=1 adds the warehouse damage reports (accountant's
//        "حركة المخزون" view)
//   POST { kind, mode, items, note?, requestId }   keeper: writeoff · manager: freeSample
//   POST { id, action: "approve" | "reject", note? } manager: writeoff · keeper: freeSample
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper", "manager", "accountant"]);
    if (req.method === "GET") {
      const q = req.query;
      const adjustments = await listAdjustments({ kind: q.kind || null, status: q.status || null, from: q.from || null, to: q.to || null });
      let damage = [];
      if (q.withDamage === "1" && (!q.kind || q.kind === "damage")) {
        const snap = await adminDb.collection("inventoryDocs").where("type", "==", "damage").get();
        damage = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => (!q.from || String(d.createdAt).slice(0, 10) >= q.from) && (!q.to || String(d.createdAt).slice(0, 10) <= q.to))
          .filter((d) => !q.status || (q.status === "approved" ? d.status === "confirmed" : d.status === q.status))
          .map((d) => ({ id: d.id, kind: "damage", status: d.status === "confirmed" ? "approved" : d.status, items: d.items || [], requestedAt: d.createdAt, decidedAt: d.finalizedAt || null, note: d.note || d.warehouseKeeperNote || "", source: d.route || "depot" }));
      }
      const rows = q.kind === "damage" ? damage : [...adjustments, ...damage];
      rows.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
      return res.status(200).json({ rows: rows.slice(0, 300) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
    const body = req.body || {};
    if (decoded.role === "accountant") return res.status(403).json({ error: "للاطلاع فقط" });
    const result = body.id ? await decideAdjustment(decoded, body.id, body) : await requestAdjustment(decoded, body);
    if (!result.duplicate) await bumpVersions(["inventory"]);
    return res.status(body.id || result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
