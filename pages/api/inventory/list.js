const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Supervisor and the warehouse keeper see everything (the warehouse
// keeper's whole job spans both cars). An agent only sees documents on
// their own route — matches how orders/list.js already scopes things.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);

    let query = adminDb.collection("inventoryDocs").orderBy("createdAt", "desc");

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute) {
      query = query.where("route", "==", restrictedRoute);
    } else if (!["supervisor", "warehouse_keeper"].includes(decoded.role)) {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    const { type } = req.query;
    if (type) {
      query = query.where("type", "==", type);
    }

    const snap = await query.get();
    const docs = snap.docs.map((doc) => {
      const data = doc.data();
      // Supplier price is supervisor-only — never sent to the warehouse
      // keeper, even in the list view.
      if (decoded.role === "warehouse_keeper") {
        data.items = data.items.map(({ costPrice, ...rest }) => rest);
      }
      return { id: doc.id, ...data };
    });

    return res.status(200).json({ docs });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
