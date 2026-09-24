const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { buildOrderFromItems, getActiveClient, calculateDeliveryDate } = require("../../../lib/orderCreation");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Staff-only version of order creation, for phone-in orders etc.
// Deliberately excludes "supervisor" — only agents place orders, and only
// for clients on their own route.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2"]);

    const { clientId, items } = req.body || {};

    const client = await getActiveClient(clientId);

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (client.route !== restrictedRoute) {
      return res.status(403).json({ error: "هذا العميل ليس ضمن مسارك" });
    }

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
      placedBy: decoded.uid,
    };

    const ref = await adminDb.collection("orders").add(orderDoc);

    return res.status(201).json({ orderId: ref.id, ...orderDoc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
