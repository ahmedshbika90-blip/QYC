const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { bumpVersions } = require("../../../../lib/versions");

const MAX_NOTE = 500;

// Only car1 (wholesale) may decide on a car2 (retail) request, and only
// while it's still awaiting that decision. Approving sends it on to the
// warehouse keeper's queue; rejecting stops it here — the warehouse
// keeper never sees a rejected request.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2", "manager"]);
    if (decoded.role !== "manager" && !decoded.salesSupervisor) {
      return res.status(403).json({ error: "غير مصرح: هذا القرار لمشرف المبيعات" });
    }

    const { id } = req.query;
    const { action, note } = req.body || {};
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "إجراء غير صالح" });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > MAX_NOTE)) {
      return res.status(400).json({ error: `الملاحظة يجب ألا تتجاوز ${MAX_NOTE} حرف` });
    }

    const docRef = adminDb.collection("shipmentRequests").doc(id);
    let outcome = null;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        const err = new Error("الطلب غير موجود");
        err.statusCode = 404;
        throw err;
      }
      const request = snap.data();
      if (request.requestedBy === decoded.uid) {
        const err = new Error("لا يمكنك اعتماد طلبك أنت");
        err.statusCode = 403;
        throw err;
      }
      if (request.type !== "loading") {
        const err = new Error("التفريغ لا يحتاج موافقة مشرف المبيعات — يذهب مباشرة لأمين المخزن");
        err.statusCode = 400;
        throw err;
      }

      const target = action === "approve" ? "pending_warehouse" : "rejected";
      if (request.status === target) {
        outcome = "repeat"; // double tap on a weak connection
        return;
      }
      if (request.status !== "pending_car1") {
        const err = new Error("تم اتخاذ قرار بشأن هذا الطلب مسبقًا");
        err.statusCode = 400;
        throw err;
      }

      tx.update(docRef, {
        status: target,
        car1Decision: { by: decoded.uid, at: new Date().toISOString(), note: note || "" },
      });
      outcome = target;
    });

    if (outcome !== "repeat") await bumpVersions(["shipmentRequests"]);
    return res.status(200).json({ ok: true, status: outcome });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
