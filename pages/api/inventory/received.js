const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { applyStockMovements } = require("../../../lib/inventory");

// Goods Received: factory/supplier deliveries into the depot. Supervisor
// creates and it takes effect immediately — no dual confirmation, since
// "inventory is controlled by the supervisor" and this is the entry
// point of stock into the whole system. Contrast with loading/offloading
// (depot <-> car), which need both the warehouse keeper and the car
// agent to confirm before stock actually moves.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);

    const { items, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "يجب إضافة منتج واحد على الأقل" });
    }
    for (const it of items) {
      if (!it.productId || !it.qty || it.qty <= 0) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية صحيحة" });
      }
    }

    // Snapshot each product's name/unit onto the document itself, so the
    // receipt still reads correctly even if a product is later renamed.
    const productRefs = items.map((it) => adminDb.collection("products").doc(it.productId));
    const productSnaps = await adminDb.getAll(...productRefs);
    const resolvedItems = items.map((it, i) => {
      const snap = productSnaps[i];
      if (!snap.exists) {
        const err = new Error("أحد المنتجات غير موجود");
        err.statusCode = 400;
        throw err;
      }
      return {
        productId: it.productId,
        name: snap.data().name,
        unit: snap.data().unit,
        qty: Number(it.qty),
        costPrice:
          it.costPrice !== undefined && it.costPrice !== null && it.costPrice !== ""
            ? Number(it.costPrice)
            : null,
      };
    });

    const docRef = adminDb.collection("inventoryDocs").doc();
    const now = new Date().toISOString();

    await adminDb.runTransaction(async (tx) => {
      await applyStockMovements(
        tx,
        resolvedItems.map((it) => ({ productId: it.productId, field: "depot", delta: it.qty }))
      );
      tx.set(docRef, {
        type: "received",
        route: null,
        items: resolvedItems,
        status: "confirmed",
        createdBy: decoded.uid,
        createdByRole: "supervisor",
        createdAt: now,
        finalizedAt: now,
        notes: notes || "",
      });
    });

    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
