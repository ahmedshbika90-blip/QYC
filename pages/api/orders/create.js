const { adminDb } = require("../../../lib/firebaseAdmin");
const { buildOrderFromItems, getActiveClient, calculateDeliveryDate } = require("../../../lib/orderCreation");
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
    const { resolvedItems, total } = await buildOrderFromItems(items, client.route);
    const deliveryDate = calculateDeliveryDate(client.route);

    const orderDoc = {
      clientId,
      route: client.route,
      items: resolvedItems,
      total,
      status: "active",
      deliveryDate: deliveryDate ? deliveryDate.toISOString() : null,
      createdAt: new Date().toISOString(),
      placedBy: "client",
    };

    const ref = await adminDb.collection("orders").add(orderDoc);

    return res.status(201).json({ orderId: ref.id, ...orderDoc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
