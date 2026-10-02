const { adminDb } = require("../../../lib/firebaseAdmin");
const { buildOrderFromItems, getActiveClient, calculateDeliveryDate } = require("../../../lib/orderCreation");
const { applyStockMovements } = require("../../../lib/inventory");
const { checkRateLimit, getClientIp } = require("../../../lib/rateLimit");

// Public — clients place their own orders here with no login, using their 4-digit ID.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    // Two separate limits: per-IP catches a script hammering many client
    // IDs from one source; per-client catches repeated fake orders aimed
    // at one specific (possibly guessed) ID. Generous enough that no real
    // customer or busy agent-on-behalf-of-client flow ever hits them.
    const ip = getClientIp(req);
    const ipOk = await checkRateLimit(`order_ip_${ip}`, { maxRequests: 20, windowMs: 10 * 60 * 1000 });
    if (!ipOk) {
      return res.status(429).json({ error: "عدد كبير من المحاولات، يرجى المحاولة لاحقًا" });
    }

    const { clientId, items } = req.body || {};

    if (clientId) {
      const clientOk = await checkRateLimit(`order_client_${clientId}`, {
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });
      if (!clientOk) {
        return res.status(429).json({ error: "عدد كبير من الطلبات لهذا العميل، يرجى المحاولة لاحقًا" });
      }
    }

    const client = await getActiveClient(clientId);
    const deliveryDate = calculateDeliveryDate(client.route);

    const docRef = adminDb.collection("orders").doc();
    let resolvedItems, total;

    // Stock check, stock decrement, and the order write all happen inside
    // one transaction — without that, two people placing an order for the
    // last few units at the same moment could both pass the "enough
    // stock?" check before either write lands, and both succeed.
    await adminDb.runTransaction(async (tx) => {
      const built = await buildOrderFromItems(items, client.route, tx);
      resolvedItems = built.resolvedItems;
      total = built.total;

      await applyStockMovements(
        tx,
        resolvedItems.map((it) => ({ productId: it.productId, field: client.route, delta: -it.qty }))
      );

      tx.set(docRef, {
        clientId,
        route: client.route,
        items: resolvedItems,
        subtotal: total, // clients can't discount their own order
        discount: 0,
        total,
        status: "active",
        deliveryDate: deliveryDate ? deliveryDate.toISOString() : null,
        createdAt: new Date().toISOString(),
        placedBy: "client",
      });
    });

    return res.status(201).json({
      orderId: docRef.id,
      clientId,
      route: client.route,
      // Never send supplier cost to the public order form.
      items: resolvedItems.map(({ unitCost, ...rest }) => rest),
      total,
      status: "active",
      deliveryDate: deliveryDate ? deliveryDate.toISOString() : null,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
