const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { bumpVersions } = require("./versions");
const { applyStockMovements } = require("./inventory");
const { roundQty, parseDecimal } = require("./qty");

/**
 * Creates a loading/offloading inventoryDocs entry. Idempotent on
 * `requestId` as the document ID, same as every other create-once flow
 * in this app.
 *
 * This is the ONLY place a loading/offloading document is created —
 * called exclusively from /api/shipment-requests/[id]/fulfill.js. There is
 * no direct/manual path anymore: a shipment request must exist first
 * (approved by car1 first, if it's a car2 LOADING request — offloading
 * never needs that approval, for either car).
 *
 * The two types finalize differently, reflecting who actually receives
 * the goods on each side:
 *  - LOADING (depot -> car): the CAR AGENT receives the goods, so the
 *    document is written "pending" and stock only moves once that agent
 *    confirms — see [id]/confirm.js.
 *  - OFFLOADING (car -> depot): the WAREHOUSE KEEPER themself receives
 *    the goods back — there's no separate party on the other end to send
 *    it to for confirmation, so it finalizes and moves stock immediately,
 *    in the same transaction that creates the document.
 *
 * `sourceRequestId` links the created document back to the shipmentRequests
 * entry it fulfills.
 */
async function createMovementDoc({ decoded, type, route, items, note, requestId, sourceRequestId, sourceRequestRef }) {
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
      qty: roundQty(parseDecimal(it.qty)),
    };
  });

  const docRef = adminDb.collection("inventoryDocs").doc(requestId);
  const now = new Date().toISOString();
  const day = businessDay();
  const counterRef = adminDb.collection("dailyCounters").doc(`${route}_${type}_${day}`);
  const autoConfirm = type === "offloading";

  let result;
  await adminDb.runTransaction(async (tx) => {
    const [existing, counter, source] = await Promise.all([
      tx.get(docRef),
      tx.get(counterRef),
      sourceRequestRef ? tx.get(sourceRequestRef) : Promise.resolve(null),
    ]);
    if (existing.exists) {
      if (existing.data().createdBy !== decoded.uid) {
        const err = new Error("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
        err.statusCode = 409;
        throw err;
      }
      result = { duplicate: true, dailySeq: existing.data().dailySeq, id: docRef.id };
      return;
    }
    if (source) {
      const st = source.exists ? source.data().status : null;
      if (st === "cancelled") {
        const err = new Error("تم إلغاء هذا الطلب — لا يمكن تنفيذه");
        err.statusCode = 400;
        throw err;
      }
      if (st !== "pending_warehouse") {
        const err = new Error("هذا الطلب ليس جاهزًا للتنفيذ");
        err.statusCode = 400;
        throw err;
      }
    }
    const dailySeq = (counter.exists ? counter.data().value : 0) + 1;

    // Offloading moves stock right here (car -> depot). Its own reads
    // must happen before ANY write in this transaction — Firestore (and
    // the test mock enforcing the same rule) requires every read across
    // the WHOLE transaction to come before every write, not just before
    // its own — so this runs before the counter/doc writes below, not
    // after.
    if (autoConfirm) {
      await applyStockMovements(
        tx,
        resolvedItems.flatMap((it) => [
          { productId: it.productId, field: route, delta: -it.qty },
          { productId: it.productId, field: "depot", delta: it.qty },
        ])
      );
    }

    tx.set(counterRef, { value: dailySeq, route, type, day });

    tx.set(docRef, {
      type,
      route,
      items: resolvedItems,
      status: autoConfirm ? "confirmed" : "pending",
      createdBy: decoded.uid,
      createdByRole: "warehouse_keeper",
      createdAt: now,
      businessDay: day,
      dailySeq,
      warehouseKeeperNote: note || "",
      sourceRequestId: sourceRequestId || null,
      // Offloading has no agent-confirmation step at all — these stay
      // false/null exactly as they would before any confirmation, since
      // no agent action is ever expected or possible for this document.
      agentConfirmed: false,
      agentConfirmedAt: null,
      agentConfirmedBy: null,
      disputeReason: null,
      finalizedAt: autoConfirm ? now : null,
    });
    if (source) {
      tx.update(sourceRequestRef, {
        status: "fulfilled",
        fulfilledDocId: docRef.id,
        fulfilledAt: now,
        fulfilledBy: decoded.uid,
      });
    }
    result = { duplicate: false, dailySeq, id: docRef.id };
  });

  if (!result.duplicate) await bumpVersions(["inventory"]);
  return result;
}

module.exports = { createMovementDoc };
