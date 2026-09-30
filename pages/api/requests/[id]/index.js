const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");

// Supervisor: any request, plus the invoice's CURRENT state (it may have
// changed since the request was made), so the decision is based on what's
// true now. Agent: only their OWN request, read-only (the agent-facing
// page never shows decide buttons — this is just so they can check status).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);

    const snap = await adminDb.collection("changeRequests").doc(req.query.id).get();
    if (!snap.exists) return res.status(404).json({ error: "الطلب غير موجود" });
    const request = snap.data();

    if (decoded.role !== "supervisor") {
      if (request.requestedBy !== decoded.uid) {
        return res.status(403).json({ error: "غير مصرح" });
      }
    }

    const orderSnap = await adminDb.collection("orders").doc(request.orderId).get();
    const order = orderSnap.exists ? { id: orderSnap.id, ...orderSnap.data() } : null;

    return res.status(200).json({ id: snap.id, ...request, order });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
