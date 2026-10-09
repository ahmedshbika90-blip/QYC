const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { cancelTx } = require("../../../../lib/invoiceChanges");
const { isLocked } = require("../../../../lib/invoiceLock");
const { bumpVersions, ordersKey } = require("../../../../lib/versions");
const { reportServerError } = require("../../../../lib/monitor");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

const MAX_NOTES = 1000;

// Cancel an invoice, and/or update its notes. Cancelling follows the same
// lock rule as editing: agents need supervisor approval once the invoice
// is locked. Notes aren't sales data, so they stay editable.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { status, notes } = req.body || {};

    if (status !== undefined && status !== "cancelled") {
      return res.status(400).json({ error: "قيمة الحالة غير صحيحة" });
    }
    if (status === undefined && notes === undefined) {
      return res.status(400).json({ error: "يرجى إدخال الحالة أو الملاحظات للتحديث" });
    }
    if (notes !== undefined && (typeof notes !== "string" || notes.length > MAX_NOTES)) {
      return res.status(400).json({ error: `الملاحظات يجب ألا تتجاوز ${MAX_NOTES} حرف` });
    }

    const orderRef = adminDb.collection("orders").doc(id);
    const snap = await orderRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "الفاتورة غير موجودة" });
    }
    const order = snap.data();

    const restrictedRoute = decoded.route;
    if (restrictedRoute && order.route !== restrictedRoute) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && decoded.role !== "manager") {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    if (status === "cancelled") {
      if (restrictedRoute && isLocked(order) && order.status !== "cancelled") {
        return res.status(403).json({ error: "الفاتورة مقفلة — أرسل طلب إلغاء إلى المدير", locked: true });
      }
      const extra = notes !== undefined ? { notes } : {};
      await adminDb.runTransaction((tx) => cancelTx(tx, orderRef, decoded.uid, extra));
    } else {
      await orderRef.update({ notes, updatedAt: new Date().toISOString(), updatedBy: decoded.uid });
    }

    await bumpVersions([ordersKey(order.route)]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
