const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { presentOrder } = require("../../../../lib/invoiceLock");
const { publicPayment } = require("../../../../lib/payments");
const { reportServerError } = require("../../../../lib/monitor");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { id } = req.query;

    const snap = await adminDb.collection("orders").doc(id).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }
    const order = snap.data();

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && order.route !== restrictedRoute) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && decoded.role !== "manager") {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    const clientSnap = await adminDb.collection("clients").doc(order.clientId).get();
    const client = clientSnap.exists ? clientSnap.data() : null;

    // Lock state from the server clock; supervisor-only fields removed for others.
    const paySnap = await adminDb.collection("invoicePayments").doc(snap.id).get();
    const payment = publicPayment(order, paySnap.exists ? paySnap.data() : null);
    return res.status(200).json({ ...presentOrder(snap.id, order, decoded.role), client, payment });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
