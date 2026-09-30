const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createOnce } = require("../../../lib/idempotentCreate");
const { applyStockMovements } = require("../../../lib/inventory");
const { bumpVersions } = require("../../../lib/versions");

// Records damaged goods as a write-off: quantity moves OUT of a real stock
// bucket (depot, car1, or car2) and INTO "damaged", which counts as gone —
// never sellable, never loadable, never part of "available" anywhere else.
// Takes effect immediately (unlike loading/offloading) since there's only
// one party involved and nothing to dual-confirm; still goes through
// applyStockMovements so it can never push a balance below zero, and is
// logged as an inventoryDocs entry for the history/audit trail.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper", "supervisor"]);

    const { source, items, note, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }
    if (!["depot", "car1", "car2"].includes(source)) {
      return res.status(400).json({ error: "مصدر التالف يجب أن يكون المخزن أو إحدى السيارتين" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "يجب إضافة منتج واحد على الأقل" });
    }
    for (const it of items) {
      if (!it.productId || !it.qty || it.qty <= 0) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية صحيحة" });
      }
    }

    const productRefs = items.map((it) => adminDb.collection("products").doc(it.productId));
    const productSnaps = await adminDb.getAll(...productRefs);
    const resolvedItems = items.map((it, i) => {
      const snap = productSnaps[i];
      if (!snap.exists) {
        const err = new Error("أحد المنتجات غير موجود");
        err.statusCode = 400;
        throw err;
      }
      return { productId: it.productId, name: snap.data().name, unit: snap.data().unit, qty: Number(it.qty) };
    });

    const docRef = adminDb.collection("inventoryDocs").doc(requestId);
    const now = new Date().toISOString();

    const result = await createOnce(
      docRef,
      {
        type: "damage",
        route: source === "depot" ? null : source,
        source,
        items: resolvedItems,
        status: "confirmed", // immediate — see comment above
        createdBy: decoded.uid,
        createdByRole: decoded.role,
        createdAt: now,
        note: note || "",
        finalizedAt: now,
      },
      { ownerField: "createdBy", ownerId: decoded.uid }
    );

    if (!result.duplicate) {
      await adminDb.runTransaction((tx) =>
        applyStockMovements(
          tx,
          resolvedItems.flatMap((it) => [
            { productId: it.productId, field: source, delta: -it.qty },
            { productId: it.productId, field: "damaged", delta: it.qty },
          ])
        )
      );
      await bumpVersions(["inventory"]);
    }

    return res.status(result.duplicate ? 200 : 201).json({ id: docRef.id, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
