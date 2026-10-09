const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { editItemsTx } = require("../../../../lib/invoiceChanges");
const { isLocked, stripCost } = require("../../../../lib/invoiceLock");
const { bumpVersions, ordersKey } = require("../../../../lib/versions");
const { reportServerError } = require("../../../../lib/monitor");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Direct edit of an invoice's items. Agents may do this only while the
// invoice is unlocked (under 9 hours old and not in a shared report);
// after that they must send a change request to the supervisor. The
// supervisor can edit directly at any time — it's still recorded in the
// edit history.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { items, discount } = req.body || {};

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
    if (restrictedRoute && isLocked(order)) {
      return res.status(403).json({ error: "الفاتورة مقفلة — أرسل طلب تعديل إلى المدير", locked: true });
    }

    const result = await adminDb.runTransaction((tx) => editItemsTx(tx, orderRef, items, decoded.uid, {}, { discount }));
    if (result.changed) await bumpVersions([ordersKey(order.route)]);

    return res.status(200).json({
      ok: true,
      items: decoded.role === "manager" ? result.items : stripCost(result.items),
      total: result.total,
    });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
