const { admin, adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { buildOrderFromItems } = require("../../../../lib/orderCreation");
const { applyStockMovements } = require("../../../../lib/inventory");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Lets staff fix a genuine mistake (wrong quantity, missing item) on an
// invoice without cancelling and recreating it. Only items and total
// change — clientId/route/deliveryDate/status stay untouched — re-priced
// from the invoice's own route (so an edit always reflects current
// pricing, same as if the item had been added fresh).
//
// Stock-wise this is a combined "give back the old quantities, then take
// the new ones" — done as one net delta per product so increasing a
// quantity correctly checks against what's freed up by releasing the old
// amount first, not just the currently-consumed stock in isolation.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { items } = req.body || {};

    const orderRef = adminDb.collection("orders").doc(id);
    const preSnap = await orderRef.get();
    if (!preSnap.exists) {
      return res.status(404).json({ error: "الفاتورة غير موجودة" });
    }
    const preOrder = preSnap.data();

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && preOrder.route !== restrictedRoute) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && decoded.role !== "supervisor") {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }
    if (preOrder.status === "cancelled") {
      return res.status(400).json({ error: "لا يمكن تعديل فاتورة ملغاة" });
    }

    let resolvedItems, total;

    await adminDb.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const order = orderSnap.data();
      if (order.status === "cancelled") {
        const err = new Error("لا يمكن تعديل فاتورة ملغاة");
        err.statusCode = 400;
        throw err;
      }

      const built = await buildOrderFromItems(items, order.route, tx, /* skipStockCheck */ true);
      resolvedItems = built.resolvedItems;
      total = built.total;

      // Net delta per product: releasing the old quantity and consuming
      // the new one in one combined movement, so applyStockMovements'
      // own floor check is the single source of truth for "is this edit
      // actually possible" — it sees the true net effect, not two
      // separate half-pictures.
      const deltaByProduct = new Map();
      for (const it of order.items) {
        deltaByProduct.set(it.productId, (deltaByProduct.get(it.productId) || 0) + it.qty);
      }
      for (const it of resolvedItems) {
        deltaByProduct.set(it.productId, (deltaByProduct.get(it.productId) || 0) - it.qty);
      }
      const movements = [...deltaByProduct.entries()]
        .filter(([, delta]) => delta !== 0)
        .map(([productId, delta]) => ({ productId, field: order.route, delta }));

      await applyStockMovements(tx, movements);

      // Preserve what the invoice looked like before this edit — otherwise
      // a change is just an overwrite with no trace of what it replaced,
      // which is a real integrity gap once anyone relies on these figures
      // (a sales report, or a synced QuickBooks record).
      tx.update(orderRef, {
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
    });

    return res.status(200).json({ ok: true, items: resolvedItems, total });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
