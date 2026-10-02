const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { buildOrderFromItems } = require("../../../lib/orderCreation");
const { isLocked } = require("../../../lib/invoiceLock");
const { isValidRequestId } = require("../../../lib/requestId");
const { bumpVersions, ordersKey } = require("../../../lib/versions");
const { applyInvoiceDiscount, orderDiscount } = require("../../../lib/invoiceDiscount");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };
const MAX_REASON = 500;
const MAX_ITEMS = 100;

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  throw err;
}

// An agent asks the supervisor to edit or cancel a LOCKED invoice.
// Nothing changes on the invoice itself until the supervisor approves —
// the request just records what the agent wants and why, plus a snapshot
// of the invoice as it is now, so the supervisor compares before/after.
// One pending request per invoice at a time.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2"]);

    const { orderId, type, items, reason, requestId, discount } = req.body || {};
    if (!isValidRequestId(requestId)) fail(400, "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى");
    if (!["edit", "cancel"].includes(type)) fail(400, "نوع الطلب غير صالح");
    if (typeof reason !== "string" || !reason.trim()) fail(400, "يرجى كتابة سبب الطلب");
    if (reason.length > MAX_REASON) fail(400, `السبب يجب ألا يتجاوز ${MAX_REASON} حرف`);
    if (type === "edit") {
      if (!Array.isArray(items) || items.length === 0) fail(400, "أضف منتجًا واحدًا على الأقل");
      if (items.length > MAX_ITEMS) fail(400, "عدد المنتجات كبير جدًا");
    }
    if (typeof orderId !== "string" || !orderId) fail(400, "الفاتورة غير محددة");

    const orderRef = adminDb.collection("orders").doc(orderId);
    const requestRef = adminDb.collection("changeRequests").doc(requestId);

    // Repeat of a request that already went through (weak connection): return it.
    const already = await requestRef.get();
    if (already.exists) {
      if (already.data().requestedBy !== decoded.uid) fail(409, "تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
      return res.status(200).json({ id: requestId, duplicate: true });
    }

    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) fail(404, "الفاتورة غير موجودة");
    const order = orderSnap.data();
    if (order.route !== ROLE_TO_ROUTE[decoded.role]) fail(403, "غير مصرح: هذا خارج مسارك");
    if (order.status === "cancelled") fail(400, "الفاتورة ملغاة بالفعل");
    if (!isLocked(order)) fail(400, "الفاتورة غير مقفلة بعد — يمكنك تعديلها مباشرة");

    // Price the proposed items now (current route prices) so the supervisor
    // sees exactly what the invoice would become. Stock is checked at
    // approval time, when the change actually happens.
    let proposedItems = null;
    let proposedTotal = null;
    let proposedDiscount = null;
    if (type === "edit") {
      const built = await buildOrderFromItems(items, order.route, null, /* skipStockCheck */ true);
      proposedItems = built.resolvedItems;
      // The invoice discount is part of the edit: unchanged unless the agent
      // sent a new amount, and always re-checked against the new lines.
      const money = applyInvoiceDiscount(proposedItems, discount === undefined ? orderDiscount(order) : discount);
      proposedDiscount = money.discount;
      proposedTotal = money.total;
    }

    const clientSnap = await adminDb.collection("clients").doc(order.clientId).get();
    const clientName = clientSnap.exists ? clientSnap.data().name : "";
    const now = new Date().toISOString();

    await adminDb.runTransaction(async (tx) => {
      const fresh = (await tx.get(orderRef)).data();
      if (fresh.pendingRequest) fail(409, "يوجد طلب معلق لهذه الفاتورة بالفعل");
      if (fresh.status === "cancelled") fail(400, "الفاتورة ملغاة بالفعل");
      tx.set(requestRef, {
        orderId,
        route: order.route,
        clientId: order.clientId,
        clientName,
        type,
        reason: reason.trim(),
        currentItems: fresh.items,
        currentTotal: fresh.total,
        currentDiscount: orderDiscount(fresh),
        proposedItems,
        proposedTotal,
        proposedDiscount,
        status: "pending",
        requestedBy: decoded.uid,
        requestedAt: now,
        decidedBy: null,
        decidedAt: null,
        decisionNote: "",
        // Whether the requesting agent has been notified of the decision
        // yet. Irrelevant while pending (that state is always shown, live,
        // for as long as it's actually pending); once decided, this flips
        // to true the first time the agent views it, so the "you have a
        // decision" notification fires exactly once — see
        // /api/action-items.js and mark-seen.js.
        seenByRequester: false,
      });
      // Stored on the invoice so pages can show "request pending" without
      // any extra reads.
      tx.update(orderRef, { pendingRequest: { id: requestId, type, requestedAt: now } });
    });

    await bumpVersions(["requests", ordersKey(order.route)]);
    return res.status(201).json({ id: requestId });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
