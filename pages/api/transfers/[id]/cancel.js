const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { bumpVersions } = require("../../../../lib/versions");

// The supervisor withdraws a transfer that hasn't been released yet.
// Nothing moves — stock only ever leaves at release.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);
    const ref = adminDb.collection("transfers").doc(String(req.query.id));
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        const e = new Error("التحويل غير موجود");
        e.statusCode = 404;
        throw e;
      }
      if (snap.data().status !== "pending") {
        const e = new Error("لا يمكن إلغاء تحويل تم إخراجه أو إلغاؤه");
        e.statusCode = 400;
        throw e;
      }
      tx.update(ref, { status: "cancelled", cancelledBy: decoded.uid, cancelledAt: new Date().toISOString() });
    });
    await bumpVersions(["transfers"]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
