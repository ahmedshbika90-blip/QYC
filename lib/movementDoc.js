const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { bumpVersions } = require("./versions");

/**
 * Creates a loading/offloading inventoryDocs entry: resolves each item's
 * name/unit, assigns the day's next sequence number for this car+type, and
 * writes the document as "pending" (stock doesn't move until the car
 * agent confirms — see [id]/confirm.js). Idempotent on `requestId` as the
 * document ID, same as every other create-once flow in this app.
 *
 * `sourceRequestId`, when given, links this document back to the agent's
 * original shipmentRequests entry (see /api/shipment-requests/*) — the
 * warehouse keeper is fulfilling that request rather than creating a
 * document from nothing.
 */
async function createMovementDoc({ decoded, type, route, items, note, requestId, sourceRequestId }) {
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
    };
  });

  const docRef = adminDb.collection("inventoryDocs").doc(requestId);
  const now = new Date().toISOString();
  const day = businessDay();
  const counterRef = adminDb.collection("dailyCounters").doc(`${route}_${type}_${day}`);

  let result;
  await adminDb.runTransaction(async (tx) => {
    const [existing, counter] = await Promise.all([tx.get(docRef), tx.get(counterRef)]);
    if (existing.exists) {
      if (existing.data().createdBy !== decoded.uid) {
        const err = new Error("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
        err.statusCode = 409;
        throw err;
      }
      result = { duplicate: true, dailySeq: existing.data().dailySeq, id: docRef.id };
      return;
    }
    const dailySeq = (counter.exists ? counter.data().value : 0) + 1;
    tx.set(counterRef, { value: dailySeq, route, type, day });
    tx.set(docRef, {
      type,
      route,
      items: resolvedItems,
      status: "pending",
      createdBy: decoded.uid,
      createdByRole: "warehouse_keeper",
      createdAt: now,
      businessDay: day,
      dailySeq,
      warehouseKeeperNote: note || "",
      sourceRequestId: sourceRequestId || null,
      agentConfirmed: false,
      agentConfirmedAt: null,
      agentConfirmedBy: null,
      disputeReason: null,
      finalizedAt: null,
    });
    result = { duplicate: false, dailySeq, id: docRef.id };
  });

  if (!result.duplicate) await bumpVersions(["inventory"]);
  return result;
}

module.exports = { createMovementDoc };
