const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { businessDay } = require("../../../lib/businessDay");
const { bumpVersions } = require("../../../lib/versions");

// Loading: depot -> car (a van heading out for the day/trip).
// Offloading: car -> depot (unsold stock coming back).
// The warehouse keeper enters the quantities either way — submitting this
// form IS their side of the confirmation. Stock doesn't actually move
// until the relevant car agent ALSO confirms (see [id]/confirm.js) — if
// the agent's own count doesn't match, they dispute instead, and nothing
// moves. No cost/price concept here at all; that's specific to goods
// received from a supplier.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper"]);

    const { type, route, items, note, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }

    if (!["loading", "offloading"].includes(type)) {
      return res.status(400).json({ error: "نوع الحركة يجب أن يكون تحميل أو تفريغ" });
    }
    if (!["car1", "car2"].includes(route)) {
      return res.status(400).json({ error: 'المسار يجب أن يكون السيارة ١ أو السيارة ٢' });
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
      return {
        productId: it.productId,
        name: snap.data().name,
        unit: snap.data().unit,
        qty: Number(it.qty),
      };
    });

    // Request ID as document ID: a repeated submission returns the
    // original instead of creating a duplicate document.
    const docRef = adminDb.collection("inventoryDocs").doc(requestId);
    const now = new Date().toISOString();

    // Daily number ("first / second / third loading of the day") per car
    // and type, assigned in the same transaction that creates the document
    // — two documents created at the same moment can never share a number.
    // A repeated submission (weak connection) returns the original.
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
        result = { duplicate: true, dailySeq: existing.data().dailySeq };
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
        agentConfirmed: false,
        agentConfirmedAt: null,
        agentConfirmedBy: null,
        disputeReason: null,
        finalizedAt: null,
      });
      result = { duplicate: false, dailySeq };
    });

    if (!result.duplicate) await bumpVersions(["inventory"]);
    return res
      .status(result.duplicate ? 200 : 201)
      .json({ id: docRef.id, dailySeq: result.dailySeq, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
