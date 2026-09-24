const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;

    const snap = await adminDb.collection("orders").doc(id).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = snap.data();

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && order.route !== restrictedRoute) {
      return res.status(403).json({ error: "Forbidden: not your route" });
    }
    if (!restrictedRoute && decoded.role !== "supervisor") {
      return res.status(403).json({ error: "Forbidden: unrecognized role" });
    }

    const clientSnap = await adminDb.collection("clients").doc(order.clientId).get();
    const client = clientSnap.exists ? clientSnap.data() : null;

    return res.status(200).json({ id: snap.id, ...order, client });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
