const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

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

    let query = adminDb.collection("orders").orderBy("createdAt", "desc");

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute) {
      query = query.where("route", "==", restrictedRoute);
    } else if (decoded.role !== "supervisor") {
      const err = new Error("Forbidden: unrecognized role");
      err.statusCode = 403;
      throw err;
    }

    const { status } = req.query;
    if (status) {
      query = query.where("status", "==", status);
    }

    const snap = await query.get();
    const orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return res.status(200).json({ orders });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
