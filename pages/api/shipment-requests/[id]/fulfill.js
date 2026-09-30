const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { isValidRequestId } = require("../../../../lib/requestId");
const { createMovementDoc } = require("../../../../lib/movementDoc");
const { bumpVersions } = require("../../../../lib/versions");

// Turns an agent's approved shipment request into the actual
// loading/offloading document — the SAME kind of document the direct path
// (/api/inventory/movement.js) creates, so everything downstream (the car
// agent's confirm/dispute, stock movement on confirm, history, PDF) works
// identically either way. The warehouse keeper can adjust quantities here
// if what's physically going out differs from what was requested; leaving
// `items` out reuses the request's original quantities as-is.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper"]);

    const { id } = req.query;
    const { items, note, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }

    const docRef = adminDb.collection("shipmentRequests").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }
    const request = snap.data();

    // Repeat of an already-fulfilled request (weak-connection retry)
    // returns the original document instead of erroring or duplicating it.
    if (request.status === "fulfilled") {
      return res.status(200).json({ id: request.fulfilledDocId, duplicate: true });
    }
    if (request.status !== "pending_warehouse") {
      return res.status(400).json({ error: "هذا الطلب ليس جاهزًا للتنفيذ" });
    }

    const finalItems = Array.isArray(items) && items.length
      ? items
      : request.items.map((it) => ({ productId: it.productId, qty: it.qty }));
    for (const it of finalItems) {
      if (!it.productId || !it.qty || it.qty <= 0) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية صحيحة" });
      }
    }

    const result = await createMovementDoc({
      decoded,
      type: request.type,
      route: request.route,
      items: finalItems,
      note,
      requestId,
      sourceRequestId: id,
    });

    if (!result.duplicate) {
      await docRef.update({
        status: "fulfilled",
        fulfilledDocId: result.id,
        fulfilledAt: new Date().toISOString(),
        fulfilledBy: decoded.uid,
      });
      await bumpVersions(["shipmentRequests"]);
    }

    return res.status(result.duplicate ? 200 : 201).json({ id: result.id, dailySeq: result.dailySeq, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
