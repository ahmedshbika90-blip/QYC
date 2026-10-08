const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { buildOrderFromItems, getActiveClient, calculateDeliveryDate } = require("../../../lib/orderCreation");
const { applyStockMovements } = require("../../../lib/inventory");
const { isValidRequestId } = require("../../../lib/requestId");
const { stripCost } = require("../../../lib/invoiceLock");
const { applyInvoiceDiscount } = require("../../../lib/invoiceDiscount");
const { writeInvoiceStats } = require("../../../lib/salesStats");
const { prepareInvoiceNumber } = require("../../../lib/invoiceNumbers");
const { CURRENCY } = require("../../../lib/companyConfig");

const MAX_NOTES = 1000;
const { bumpVersions, ordersKey } = require("../../../lib/versions");
const { reportServerError } = require("../../../lib/monitor");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Staff-only version of order creation, for phone-in orders etc.
// Deliberately excludes "manager" — only agents place orders, and only
// for clients on their own route.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2"]);

    const { clientId, items, requestId, discount, notes } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }
    // A note can be written on the invoice before it's submitted (it used
    // to be possible only afterwards, from the invoice page).
    if (notes !== undefined && (typeof notes !== "string" || notes.length > MAX_NOTES)) {
      return res.status(400).json({ error: `الملاحظة يجب ألا تتجاوز ${MAX_NOTES} حرف` });
    }

    const client = await getActiveClient(clientId);

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (client.route !== restrictedRoute) {
      return res.status(403).json({ error: "هذا العميل ليس ضمن مسارك" });
    }

    const deliveryDate = calculateDeliveryDate(client.route);
    // The device-generated request ID IS the invoice's document ID. If a
    // weak connection delivers the same submission twice, the second one
    // finds the invoice already exists and returns it — no duplicate
    // invoice, no stock reserved twice.
    const docRef = adminDb.collection("orders").doc(requestId);
    let resolvedItems, total, money;
    let existing = null;
    let created = null;

    // Stock check, stock decrement, and the order write all happen inside
    // one transaction — same reasoning as the public order-creation route.
    await adminDb.runTransaction(async (tx) => {
      const already = await tx.get(docRef);
      if (already.exists) {
        existing = already.data();
        return; // repeat of a submission that already succeeded
      }
      const createdAt = new Date().toISOString();
      // Legal number (INV-2026-000123), reserved before any write.
      const numbering = await prepareInvoiceNumber(tx, createdAt);
      const built = await buildOrderFromItems(items, client.route, tx);
      resolvedItems = built.resolvedItems;
      money = applyInvoiceDiscount(resolvedItems, discount);
      total = money.total;

      await applyStockMovements(
        tx,
        resolvedItems.map((it) => ({ productId: it.productId, field: client.route, delta: -it.qty }))
      );

      const invoice = {
        clientId,
        route: client.route,
        items: resolvedItems,
        subtotal: money.subtotal,
        discount: money.discount,
        total,
        notes: (notes || "").trim(),
        status: "active",
        deliveryDate: deliveryDate ? deliveryDate.toISOString() : null,
        createdAt,
        currency: CURRENCY, // company settings (lib/companyConfig.js)
        placedBy: decoded.uid,
        ...(numbering ? { number: numbering.number, numberYear: numbering.numberYear, numberSeq: numbering.numberSeq } : {}),
      };
      tx.set(docRef, invoice);
      if (numbering) numbering.commit();
      created = invoice;
      writeInvoiceStats(tx, null, invoice); // daily summary, same transaction
    });

    if (existing) {
      if (existing.placedBy !== decoded.uid) {
        return res.status(409).json({ error: "تعارض في رقم الطلب، يرجى المحاولة مرة أخرى" });
      }
      return res.status(200).json({ orderId: docRef.id, ...existing, items: stripCost(existing.items), duplicate: true });
    }

    await bumpVersions([ordersKey(client.route)]);
    return res.status(201).json({
      orderId: docRef.id,
      number: created?.number || null,
      clientId,
      route: client.route,
      items: stripCost(resolvedItems),
      subtotal: money.subtotal,
      discount: money.discount,
      total,
      status: "active",
      deliveryDate: deliveryDate ? deliveryDate.toISOString() : null,
    });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
