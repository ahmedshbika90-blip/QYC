const { adminDb } = require("../../../lib/firebaseAdmin");
const { parseQty, isValidQty } = require("../../../lib/qty");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createOnce } = require("../../../lib/idempotentCreate");
const { applyStockMovements } = require("../../../lib/inventory");
const { bumpVersions } = require("../../../lib/versions");

// Records damaged goods as a write-off: quantity moves OUT of a real stock
// bucket (depot, car1, or car2) and INTO "damaged", which counts as gone —
// never sellable, never loadable, never part of "available" anywhere else.
//
// From the WAREHOUSE KEEPER it's only a request: the document is saved as
// "pending" and NOTHING moves until the supervisor approves it in الطلبات
// (see [id]/approve.js, which does the actual stock movement and re-checks
// the balance at that moment). Only then does it show in المخزون.
// From the SUPERVISOR it takes effect immediately — he is the approver.
//
// The quantity is checked against the current balance now as well, so the
// keeper is told straight away instead of the supervisor finding out later.
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
      if (!it.productId || !isValidQty(it.qty)) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية بعدد صحيح أكبر من صفر (بدون كسور)" });
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
      return { productId: it.productId, name: snap.data().name, unit: snap.data().unit, qty: parseQty(it.qty) };
    });

    const sourceSnaps = await adminDb.getAll(...resolvedItems.map((it) => adminDb.collection("products").doc(it.productId)));
    const short = resolvedItems.find((it, i) => it.qty > (sourceSnaps[i].data().stock?.[source] || 0));
    if (short) {
      return res.status(400).json({ error: `رصيد "${short.name}" غير كافٍ لتسجيل هذا التالف` });
    }

    const docRef = adminDb.collection("inventoryDocs").doc(requestId);
    const now = new Date().toISOString();
    const immediate = decoded.role === "supervisor";

    const result = await createOnce(
      docRef,
      {
        type: "damage",
        route: source === "depot" ? null : source,
        source,
        items: resolvedItems,
        status: immediate ? "confirmed" : "pending", // keeper → waits for the supervisor
        createdBy: decoded.uid,
        createdByRole: decoded.role,
        createdAt: now,
        note: note || "",
        finalizedAt: immediate ? now : null,
      },
      { ownerField: "createdBy", ownerId: decoded.uid }
    );

    if (!result.duplicate && immediate) {
      await adminDb.runTransaction((tx) =>
        applyStockMovements(
          tx,
          resolvedItems.flatMap((it) => [
            { productId: it.productId, field: source, delta: -it.qty },
            { productId: it.productId, field: "damaged", delta: it.qty },
          ])
        )
      );
    }
    if (!result.duplicate) await bumpVersions(["inventory"]);

    return res.status(result.duplicate ? 200 : 201).json({ id: docRef.id, duplicate: result.duplicate, status: immediate ? "confirmed" : "pending" });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
