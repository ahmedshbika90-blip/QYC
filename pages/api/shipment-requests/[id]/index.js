const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");

// Supervisor and the warehouse keeper can read any shipment request.
// An agent can read their own, and car1 can also read car2's (car1 has
// an approval role over car2's shipping orders).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const snap = await adminDb.collection("shipmentRequests").doc(req.query.id).get();
    if (!snap.exists) return res.status(404).json({ error: "الطلب غير موجود" });
    const request = snap.data();

    const allowed =
      decoded.role === "manager" ||
      decoded.role === "warehouse_keeper" ||
      request.requestedBy === decoded.uid ||
      Boolean(decoded.salesSupervisor);
    if (!allowed) return res.status(403).json({ error: "غير مصرح" });

    return res.status(200).json({ id: snap.id, ...request });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
