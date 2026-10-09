const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, sendError } = require("../../../../lib/apiAuth");
const { refundTx, planRefund } = require("../../../../lib/refunds");
const { isLocked } = require("../../../../lib/invoiceLock");
const { isValidRequestId } = require("../../../../lib/requestId");
const { bumpVersions, ordersKey } = require("../../../../lib/versions");
const { reportServerError } = require("../../../../lib/monitor");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

// Refund (مرتجع) on an invoice.
//   POST { lines: [{ index, qty, damaged }], requestId, reason? }
//   - the van's agent within 9 hours, or the manager any time: applied now (200)
//   - the agent after 9 hours: a request to the manager (201, { requested: true }) — reason required
//   POST { preview: true, lines } → the refund's value, nothing saved
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    const { id } = req.query;
    const { lines, requestId, reason, preview } = req.body || {};
    const orderRef = adminDb.collection("orders").doc(String(id || ""));
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: "الفاتورة غير موجودة" });
    const order = snap.data();
    const route = decoded.route;
    if (route && order.route !== route) return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    if (!route && decoded.role !== "manager") return res.status(403).json({ error: "غير مصرح" });
    if (order.status === "cancelled") return res.status(400).json({ error: "لا يمكن إرجاع فاتورة ملغاة" });

    if (preview) {
      const plan = planRefund(order, lines);
      return res.status(200).json({ value: plan.value, full: plan.full, newTotal: plan.money.total });
    }
    if (!isValidRequestId(requestId)) return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });

    // After 9 hours an agent asks the manager.
    if (route && isLocked(order)) {
      const text = typeof reason === "string" ? reason.trim() : "";
      if (!text) return res.status(400).json({ error: "يرجى كتابة سبب المرتجع — الفاتورة مقفلة وسيُرسل الطلب إلى المدير" });
      const plan = planRefund(order, lines); // checks the lines now
      const reqRef = adminDb.collection("changeRequests").doc(requestId);
      const clientSnap = await adminDb.collection("clients").doc(String(order.clientId)).get();
      const now = new Date().toISOString();
      let duplicate = false;
      await adminDb.runTransaction(async (tx) => {
        const [existing, fresh] = await Promise.all([tx.get(reqRef), tx.get(orderRef)]);
        if (existing.exists) {
          duplicate = true;
          return;
        }
        if (fresh.data().pendingRequest) {
          const e = new Error("يوجد طلب معلق لهذه الفاتورة بالفعل");
          e.statusCode = 409;
          throw e;
        }
        tx.set(reqRef, {
          orderId: orderRef.id,
          route: order.route,
          clientId: order.clientId,
          clientName: clientSnap.exists ? clientSnap.data().name : "",
          type: "refund",
          reason: text.slice(0, 500),
          refundLines: lines.map((l) => ({ index: Number(l.index), qty: Number(l.qty), damaged: !!l.damaged })),
          refundPreview: { value: plan.value, full: plan.full, lines: plan.returned },
          currentItems: fresh.data().items,
          currentTotal: fresh.data().total,
          status: "pending",
          requestedBy: decoded.uid,
          requestedAt: now,
          decidedBy: null,
          decidedAt: null,
          decisionNote: "",
          seenByRequester: false,
        });
        tx.update(orderRef, { pendingRequest: { id: requestId, type: "refund", requestedAt: now } });
      });
      if (!duplicate) await bumpVersions(["requests", ordersKey(order.route)]);
      return res.status(duplicate ? 200 : 201).json({ requested: true, duplicate });
    }

    const result = await adminDb.runTransaction((tx) => refundTx(tx, orderRef, lines, decoded.uid, {}, { refundId: requestId }));
    if (!result.duplicate) await bumpVersions([ordersKey(order.route), "inventory", "payments"]);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
