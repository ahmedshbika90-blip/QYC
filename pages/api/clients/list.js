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

    let query = adminDb.collection("clients").orderBy("createdAt", "desc");

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute) {
      query = query.where("route", "==", restrictedRoute);
    } else if (decoded.role !== "supervisor") {
      const err = new Error("Forbidden: unrecognized role");
      err.statusCode = 403;
      throw err;
    }

    const snap = await query.get();
    let clients = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Simple in-memory search by name/store/location/id — fine at this scale.
    // Move to a search service if the client list grows into the thousands.
    const { q } = req.query;
    if (q) {
      const needle = q.toLowerCase();
      clients = clients.filter(
        (c) =>
          c.id.includes(needle) ||
          (c.name || "").toLowerCase().includes(needle) ||
          (c.storeName || "").toLowerCase().includes(needle) ||
          (c.location || "").toLowerCase().includes(needle)
      );
    }

    return res.status(200).json({ clients });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
