const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");

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

    const snap = await adminDb.collection("inventoryDocs").doc(id).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "المستند غير موجود" });
    }
    const doc = snap.data();

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && doc.route !== restrictedRoute) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && !["supervisor", "warehouse_keeper"].includes(decoded.role)) {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    return res.status(200).json({ id: snap.id, ...doc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
