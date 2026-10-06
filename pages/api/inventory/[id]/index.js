const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { ROUTES } = require("../../../../lib/roles");

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

    // The sales supervisor (car1) may also open other vans' documents once
    // they're confirmed — the same ones his fleet history lists.
    const fleetView = decoded.salesSupervisor && doc.status === "confirmed" && ROUTES.includes(doc.route);
    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute && doc.route !== restrictedRoute && !fleetView) {
      return res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    }
    if (!restrictedRoute && !["manager", "warehouse_keeper"].includes(decoded.role)) {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    // Supplier price is supervisor-only information — the warehouse
    // keeper never enters it and never sees it, even after approval.
    if (decoded.role !== "manager") {
      doc.items = doc.items.map(({ costPrice, ...rest }) => rest);
    }

    return res.status(200).json({ id: snap.id, ...doc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
