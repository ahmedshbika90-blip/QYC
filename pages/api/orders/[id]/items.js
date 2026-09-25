const { admin, adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { buildOrderFromItems } = require("../../../../lib/orderCreation");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Lets staff fix a genuine mistake (wrong quantity, missing item) on an
// invoice without cancelling and recreating it. Only ever touches
// clientId/route/deliveryDate/status stay untouched — only items and
// total change, re-priced from the invoice's own route (so an edit always
// reflects current pricing, same as if the item had been added fresh).
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { items } = req.body || {};

    const orderRef = adminDb.collection("orders").doc(id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "الفاتورة غير موجودة" });
    }
    const order = orderSnap.data();

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && order.route !== restrictedRoute) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && decoded.role !== "supervisor") {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({ error: "لا يمكن تعديل فاتورة ملغاة" });
    }

    const { resolvedItems, total } = await buildOrderFromItems(items, order.route);

    // Preserve what the invoice looked like before this edit — otherwise
    // a change is just an overwrite with no trace of what it replaced,
    // which is a real integrity gap once anyone relies on these figures
    // (a sales report, or a synced QuickBooks record).
    await orderRef.update({
      items: resolvedItems,
      total,
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.uid,
      editHistory: admin.firestore.FieldValue.arrayUnion({
        items: order.items,
        total: order.total,
        editedAt: new Date().toISOString(),
        editedBy: decoded.uid,
      }),
    });

    return res.status(200).json({ ok: true, items: resolvedItems, total });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
