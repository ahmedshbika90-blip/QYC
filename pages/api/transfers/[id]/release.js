const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { bumpVersions } = require("../../../../lib/versions");
const { applyStockMovements } = require("../../../../lib/inventory");
const { businessDay } = require("../../../../lib/businessDay");
const { reportServerError } = require("../../../../lib/monitor");

// The warehouse keeper hands the goods over: stock leaves the depot NOW,
// in the same transaction that marks the transfer released. The balance
// check inside applyStockMovements refuses it if the depot no longer has
// enough. A stock-history document of type "transfer" is written with it,
// so the release shows up alongside every other depot movement. Its
// route is null, like other depot-only documents, so agents never see it.
function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper"]);

    const { id } = req.query;
    const ref = adminDb.collection("transfers").doc(String(id));
    const day = businessDay();
    const counterRef = adminDb.collection("dailyCounters").doc(`depot_transfer_${day}`);
    const docRef = adminDb.collection("inventoryDocs").doc(`transfer-${id}`);
    const now = new Date().toISOString();

    await adminDb.runTransaction(async (tx) => {
      // Every read before any write (Firestore rule, enforced by the mock).
      const [snap, counter] = await Promise.all([tx.get(ref), tx.get(counterRef)]);
      if (!snap.exists) throw fail("التحويل غير موجود", 404);
      const t = snap.data();
      if (t.status === "released") throw fail("تم إخراج هذا التحويل من قبل");
      if (t.status !== "pending") throw fail("تم إلغاء هذا التحويل — لا يمكن إخراجه");

      await applyStockMovements(
        tx,
        t.items.map((it) => ({ productId: it.productId, field: "depot", delta: -it.qty }))
      );

      const dailySeq = (counter.exists ? counter.data().value : 0) + 1;
      tx.set(counterRef, { value: dailySeq, route: null, type: "transfer", day });
      tx.set(docRef, {
        type: "transfer",
        route: null,
        items: t.items,
        status: "confirmed",
        createdBy: decoded.uid,
        createdByRole: "warehouse_keeper",
        createdAt: now,
        confirmedAt: now,
        finalizedAt: now,
        businessDay: day,
        dailySeq,
        warehouseKeeperNote: t.note || "",
        sourceTransferId: String(id),
      });
      tx.update(ref, { status: "released", releasedBy: decoded.uid, releasedAt: now, inventoryDocId: docRef.id });
    });

    await bumpVersions(["transfers", "inventory"]);
    return res.status(200).json({ ok: true, inventoryDocId: docRef.id });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
