const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { applyStockMovements } = require("../../../../lib/inventory");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

const VALID_STATUSES = ["active", "cancelled"];

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

    // Cancelling releases the stock this invoice had reserved back onto
    // the car — only on the actual pending->cancelled transition, so
    // cancelling an already-cancelled invoice (which shouldn't normally
    // happen, but isn't impossible with a stale page) never double-credits
    // stock that was already given back once.
    if (status === "cancelled" && order.status !== "cancelled") {
      await adminDb.runTransaction(async (tx) => {
        await applyStockMovements(
          tx,
          order.items.map((it) => ({ productId: it.productId, field: order.route, delta: it.qty }))
        );
        tx.update(orderRef, updates);
      });
    } else {
      await orderRef.update(updates);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
