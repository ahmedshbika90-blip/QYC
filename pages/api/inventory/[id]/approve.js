const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { applyStockMovements } = require("../../../../lib/inventory");
const { bumpVersions } = require("../../../../lib/versions");

// Only the supervisor can approve a Goods Received or a Damage document —
// this is the actual gate that moves stock. Both arrive in his الطلبات
// queue as "pending" and only show in المخزون once decided. Quantities are never re-trusted from
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
    if (doc.type !== "received" && doc.type !== "damage") {
      return res.status(400).json({ error: "هذا الإجراء خاص بمستندات استلام البضاعة والتالف فقط" });
    }
    // Repeat of an already-completed decision (weak-connection retry) succeeds quietly.
    if (action === "approve" && doc.status === "confirmed") return res.status(200).json({ ok: true });
    if (action === "reject" && doc.status === "rejected") return res.status(200).json({ ok: true });
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
      await bumpVersions(["inventory"]);
      return res.status(200).json({ ok: true });
    }

    // Damage: move source → damaged, re-checking the balance NOW (stock
    // may have moved since the keeper recorded it). Double approval can't
    // deduct twice — the status is re-checked inside the transaction.
    if (doc.type === "damage") {
      await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(docRef);
        if (fresh.data().status !== "pending") return;
        await applyStockMovements(
          tx,
          doc.items.flatMap((it) => [
            { productId: it.productId, field: doc.source, delta: -it.qty },
            { productId: it.productId, field: "damaged", delta: it.qty },
          ])
        );
        tx.update(docRef, { status: "confirmed", confirmedBy: decoded.uid, finalizedAt: now });
      });
      await bumpVersions(["inventory"]);
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

    // Re-checked inside the transaction so a double submission can never
    // add the same delivery to depot stock twice.
    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(docRef);
      if (fresh.data().status !== "pending") return;

      // Weighted-average cost: blend the new supplier price with the cost
      // of stock already on hand (depot + both cars), weighted by quantity.
      // Read BEFORE stock moves, so "on hand" is the pre-delivery amount.
      const costUpdates = [];
      const byProduct = new Map();
      for (const it of pricedItems) {
        if (it.costPrice == null) continue;
        const cur = byProduct.get(it.productId) || { qty: 0, value: 0 };
        cur.qty += it.qty;
        cur.value += it.qty * it.costPrice;
        byProduct.set(it.productId, cur);
      }
      for (const [productId, inc] of byProduct) {
        const ref = adminDb.collection("products").doc(productId);
        const p = (await tx.get(ref)).data() || {};
        const onHand = Math.max(0, (p.stock?.depot || 0) + (p.stock?.car1 || 0) + (p.stock?.car2 || 0));
        const oldAvg = typeof p.avgCost === "number" ? p.avgCost : inc.value / inc.qty;
        const newAvg = (onHand * oldAvg + inc.value) / (onHand + inc.qty);
        costUpdates.push({ ref, avgCost: Math.round(newAvg * 100) / 100 });
      }

      await applyStockMovements(
        tx,
        doc.items.map((it) => ({ productId: it.productId, field: "depot", delta: it.qty }))
      );
      costUpdates.forEach(({ ref, avgCost }) => tx.update(ref, { avgCost }));
      tx.update(docRef, {
        items: pricedItems,
        status: "confirmed",
        confirmedBy: decoded.uid,
        finalizedAt: now,
      });
    });

    await bumpVersions(["inventory"]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
