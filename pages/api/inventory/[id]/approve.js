const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { applyStockMovements } = require("../../../../lib/inventory");

// Only the supervisor can approve a Goods Received document — this is
// the actual gate that moves stock. Quantities are never re-trusted from
// the request here (they come from the warehouse keeper's original
// document, which is already in Firestore); only the supplier price per
// unit is supplied here, since that's supervisor-only information the
// warehouse keeper never enters or sees.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);

    const { id } = req.query;
    const { action, costPrices, rejectReason } = req.body || {};
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "إجراء غير صالح" });
    }

    const docRef = adminDb.collection("inventoryDocs").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "المستند غير موجود" });
    }
    const doc = docSnap.data();
    if (doc.type !== "received") {
      return res.status(400).json({ error: "هذا الإجراء خاص بمستندات استلام البضاعة فقط" });
    }
    if (doc.status !== "pending") {
      return res.status(400).json({ error: "تم اتخاذ إجراء بشأن هذا المستند مسبقًا" });
    }

    const now = new Date().toISOString();

    if (action === "reject") {
      await docRef.update({
        status: "rejected",
        rejectReason: rejectReason || "",
        confirmedBy: decoded.uid,
        finalizedAt: now,
      });
      return res.status(200).json({ ok: true });
    }

    // Approve: attach the supervisor's supplier price per unit to each
    // item, then move the stock — both inside one transaction so a
    // failure partway through never leaves stock updated without the
    // document reflecting it, or vice versa.
    const pricedItems = doc.items.map((it) => ({
      ...it,
      costPrice:
        costPrices && costPrices[it.productId] !== undefined && costPrices[it.productId] !== ""
          ? Number(costPrices[it.productId])
          : null,
    }));

    await adminDb.runTransaction(async (tx) => {
      await applyStockMovements(
        tx,
        doc.items.map((it) => ({ productId: it.productId, field: "depot", delta: it.qty }))
      );
      tx.update(docRef, {
        items: pricedItems,
        status: "confirmed",
        confirmedBy: decoded.uid,
        finalizedAt: now,
      });
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
