const { adminDb } = require("../../../lib/firebaseAdmin");
const { buildOrderFromItems, getActiveClient, calculateDeliveryDate } = require("../../../lib/orderCreation");

// Public — clients place their own orders here with no login, using their 4-digit ID.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const { clientId, items } = req.body || {};

    const client = await getActiveClient(clientId);
    const { resolvedItems, total } = await buildOrderFromItems(items);
    const deliveryDate = calculateDeliveryDate(client.route);

    const orderDoc = {
      clientId,
      route: client.route,
      items: resolvedItems,
      total,
      status: "pending",
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
