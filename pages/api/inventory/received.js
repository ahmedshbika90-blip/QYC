const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createOnce } = require("../../../lib/idempotentCreate");

// Goods Received: factory/supplier deliveries into the depot. The
// warehouse keeper logs what physically arrived (product + quantity)
// along with their own note — but NOT a price; pricing is supervisor-only
// information the warehouse keeper never sees. This just records the
// receipt as "pending" — stock doesn't move yet. The supervisor reviews
// it, adds the supplier price per unit, and approves it separately
// (see /api/inventory/[id]/approve.js) — only that approval step actually
// updates depot stock, which is what "the supervisor can't add inventory,
// only approve it" means in practice: they control the gate, not the entry.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper"]);

    const { items, note, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }

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
        costPrice: null, // set later by the supervisor on approval, never by the warehouse keeper
      };
    });

    // Request ID as document ID: a repeated submission returns the
    // original instead of creating a duplicate document.
    const docRef = adminDb.collection("inventoryDocs").doc(requestId);
    const now = new Date().toISOString();

    const result = await createOnce(
      docRef,
      {
        type: "received",
        route: null,
        items: resolvedItems,
        status: "pending",
        createdBy: decoded.uid,
        createdByRole: "warehouse_keeper",
        createdAt: now,
        warehouseKeeperNote: note || "",
        finalizedAt: null,
      },
      { ownerField: "createdBy", ownerId: decoded.uid }
    );

    return res.status(result.duplicate ? 200 : 201).json({ id: docRef.id, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
