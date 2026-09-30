const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { applyStockMovements } = require("../../../../lib/inventory");
const { bumpVersions } = require("../../../../lib/versions");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Confirming is the agent attesting "yes, this matches what I actually
// received/handed over" — even though the warehouse keeper typed the
// numbers, this is the independent check that catches a mismatch before
// stock ever moves. Disputing does the opposite: stock stays untouched,
// and the mismatch is on record rather than silently resolved either way.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { action, disputeReason } = req.body || {};

    const docRef = adminDb.collection("inventoryDocs").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "المستند غير موجود" });
    }
    const doc = docSnap.data();
    if (!["loading", "offloading"].includes(doc.type)) {
      return res.status(400).json({ error: "هذا الإجراء خاص بمستندات أمر الشحن ومرتجع البضاعة فقط" });
    }

    const now = new Date().toISOString();

    if (action === "cancel") {
      requireSupervisor(decoded);
      if (doc.status === "cancelled") return res.status(200).json({ ok: true }); // repeat — already done
      if (doc.status === "confirmed") {
        return res.status(400).json({ error: "لا يمكن إلغاء حركة تمت بالفعل" });
      }
      await docRef.update({ status: "cancelled", finalizedAt: now, cancelledBy: decoded.uid });
      await bumpVersions(["inventory"]);
      return res.status(200).json({ ok: true });
    }

    if (!["confirm", "dispute"].includes(action)) {
      return res.status(400).json({ error: "إجراء غير صالح" });
    }

    const requiredRoute = ROLE_TO_ROUTE[decoded.role];
    if (!requiredRoute || requiredRoute !== doc.route) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    // A repeat of an action this agent already completed (e.g. a retry on a
    // weak connection) succeeds quietly instead of showing a false error.
    if (doc.agentConfirmedBy === decoded.uid) {
      if (action === "confirm" && doc.status === "confirmed") return res.status(200).json({ ok: true });
      if (action === "dispute" && doc.status === "disputed") return res.status(200).json({ ok: true });
    }
    if (doc.status !== "pending") {
      return res.status(400).json({ error: "تم اتخاذ إجراء بشأن هذا المستند مسبقًا" });
    }

    if (action === "dispute") {
      await docRef.update({
        status: "disputed",
        disputeReason: disputeReason || "",
        agentConfirmedBy: decoded.uid,
        finalizedAt: now,
      });
      await bumpVersions(["inventory"]);
      return res.status(200).json({ ok: true });
    }

    // Confirm: move the stock. Loading = depot -> car; offloading = car -> depot.
    const direction = doc.type === "loading" ? 1 : -1;
    // Status is re-checked INSIDE the transaction: two near-simultaneous
    // confirms (e.g. a retry landing while the first is still processing)
    // must never move stock twice.
    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(docRef);
      if (fresh.data().status !== "pending") return; // the other attempt already did it
      await applyStockMovements(
        tx,
        doc.items.flatMap((it) => [
          { productId: it.productId, field: "depot", delta: -it.qty * direction },
          { productId: it.productId, field: doc.route, delta: it.qty * direction },
        ])
      );
      tx.update(docRef, {
        status: "confirmed",
        agentConfirmed: true,
        agentConfirmedAt: now,
        agentConfirmedBy: decoded.uid,
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

function requireSupervisor(decoded) {
  if (decoded.role !== "supervisor") {
    const err = new Error("غير مصرح: هذا الإجراء للمشرف فقط");
    err.statusCode = 403;
    throw err;
  }
}
