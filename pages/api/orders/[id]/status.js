const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

const VALID_STATUSES = ["pending", "delivered", "cancelled"];

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { status, notes } = req.body || {};

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "قيمة الحالة غير صحيحة" });
    }
    if (status === undefined && notes === undefined) {
      return res.status(400).json({ error: "يرجى إدخال الحالة أو الملاحظات للتحديث" });
    }

    const orderRef = adminDb.collection("orders").doc(id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }
    const order = orderSnap.data();

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && order.route !== restrictedRoute) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && decoded.role !== "supervisor") {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    await orderRef.update(updates);

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
