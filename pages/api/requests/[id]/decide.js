const { admin, adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { orderLineToPayload } = require("../../../../lib/linePrice");
const { editItemsTx, cancelTx } = require("../../../../lib/invoiceChanges");
const { refundTx } = require("../../../../lib/refunds");
const { bumpVersions, ordersKey } = require("../../../../lib/versions");
const { buildClientUpdates } = require("../../../../lib/clientFields");
const { reportServerError } = require("../../../../lib/monitor");

const MAX_NOTE = 500;

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  throw err;
}

// Supervisor approves or rejects a change request. On approval the change
// is applied with the SAME logic as a direct edit/cancel (stock moves by
// the net difference, edit history recorded, current prices, live stock
// check) — all in one transaction with the request's status update, so the
// invoice can never change without the request being marked, or the other
// way round. Re-checked inside the transaction: a double tap never applies
// a change twice.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);

    const { id } = req.query;
    const { action, note } = req.body || {};
    if (!["approve", "reject"].includes(action)) fail(400, "إجراء غير صالح");
    if (note !== undefined && (typeof note !== "string" || note.length > MAX_NOTE)) {
      fail(400, `الملاحظة يجب ألا تتجاوز ${MAX_NOTE} حرف`);
    }

    const requestRef = adminDb.collection("changeRequests").doc(id);
    let outcome = null;
    let route = null;
    let isClientRequest = false;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(requestRef);
      if (!snap.exists) fail(404, "الطلب غير موجود");
      const request = snap.data();
      route = request.route;

      const target = action === "approve" ? "approved" : "rejected";
      if (request.status === target) {
        outcome = "repeat";
        return; // already done (e.g. double tap on a weak connection)
      }
      if (request.status !== "pending") fail(400, "تم اتخاذ قرار بشأن هذا الطلب مسبقًا");

      const now = new Date().toISOString();

      // Client-details change (12-hour lock). Approving writes exactly the
      // proposed fields, re-validated now; rejecting leaves the client as is.
      if (request.type === "client_edit") {
        isClientRequest = true;
        const clientRef = adminDb.collection("clients").doc(request.clientId);
        const clientSnap = await tx.get(clientRef);
        if (clientSnap.exists) {
          const clientUpdate = { pendingRequest: admin.firestore.FieldValue.delete(), syncAt: now };
          if (action === "approve") {
            Object.assign(clientUpdate, buildClientUpdates(request.proposedClient, clientSnap.data()), {
              updatedAt: now,
              updatedBy: decoded.uid,
            });
          }
          tx.update(clientRef, clientUpdate);
        } else if (action === "approve") {
          fail(404, "العميل لم يعد موجودًا");
        }
        tx.update(requestRef, { status: target, decidedBy: decoded.uid, decidedAt: now, decisionNote: note || "" });
        outcome = target;
        return;
      }

      const orderRef = adminDb.collection("orders").doc(request.orderId);
      const orderUpdate = {
        pendingRequest: admin.firestore.FieldValue.delete(),
        lastRequest: { id, type: request.type, status: target, decidedAt: now, note: note || "" },
      };

      if (action === "approve") {
        if (request.type === "edit") {
          // Re-applied exactly as proposed: quantity, free sample and price adjustment.
          const items = request.proposedItems.map(orderLineToPayload);
          await editItemsTx(tx, orderRef, items, decoded.uid, orderUpdate, {
            discount: request.proposedDiscount ?? undefined,
          });
        } else if (request.type === "refund") {
          await refundTx(tx, orderRef, request.refundLines, decoded.uid, orderUpdate, { refundId: id });
        } else {
          await cancelTx(tx, orderRef, decoded.uid, orderUpdate);
        }
      } else {
        const order = await tx.get(orderRef);
        if (order.exists) tx.update(orderRef, orderUpdate);
      }

      tx.update(requestRef, {
        status: target,
        decidedBy: decoded.uid,
        decidedAt: now,
        decisionNote: note || "",
      });
      outcome = target;
    });

    if (outcome !== "repeat") {
      await bumpVersions(isClientRequest ? ["requests", "clients"] : ["requests", ordersKey(route), "inventory", "payments"]);
    }
    return res.status(200).json({ ok: true, status: outcome });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
