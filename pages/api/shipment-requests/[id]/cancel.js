const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { bumpVersions } = require("../../../../lib/versions");
const { MAX_CANCEL_NOTE } = require("../../../../lib/shipmentStatus");
const { reportServerError } = require("../../../../lib/monitor");

// The warehouse keeper's alternative to accepting: cancel a shipping
// order or a cargo return that's waiting on him, with a note saying why
// (stock isn't there, wrong request, the car didn't show up …).
//
//  - The note is REQUIRED: the agent is notified with it, and a bare
//    "cancelled" with no reason just produces a phone call.
//  - Nothing moves: no document is created and no stock changes — a
//    pending request never touched stock in the first place.
//  - Cancelling closes the request, so the agent can send a new one
//    straight away (the one-open-request rule only counts open ones).
//  - A repeat of the same cancel (double tap, weak connection) is a no-op.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper"]);

    const { id } = req.query;
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (!note) {
      return res.status(400).json({ error: "اكتب سبب الإلغاء — سيصل للمندوب مع الإشعار" });
    }
    if (note.length > MAX_CANCEL_NOTE) {
      return res.status(400).json({ error: `سبب الإلغاء يجب ألا يتجاوز ${MAX_CANCEL_NOTE} حرف` });
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
      if (request.status === "cancelled") {
        outcome = "repeat";
        return;
      }
      if (request.status === "fulfilled") {
        const err = new Error("تم تنفيذ هذا الطلب بالفعل — لا يمكن إلغاؤه");
        err.statusCode = 400;
        throw err;
      }
      if (request.status !== "pending_warehouse") {
        const err = new Error("هذا الطلب ليس بانتظارك — لا يمكن إلغاؤه من هنا");
        err.statusCode = 400;
        throw err;
      }

      tx.update(docRef, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: decoded.uid,
        cancelNote: note,
      });
      outcome = "cancelled";
    });

    if (outcome !== "repeat") await bumpVersions(["shipmentRequests"]);
    return res.status(200).json({ ok: true, status: "cancelled", duplicate: outcome === "repeat" });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
