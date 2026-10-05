const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { businessDay } = require("../../../lib/businessDay");

// What number the NEXT loading/offloading for a car would get today — shown
// on the warehouse keeper's form ("this will be the 3rd loading today").
// 1 read.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper", "manager"]);
    const { route, type } = req.query;
    if (!["car1", "car2"].includes(route) || !["loading", "offloading"].includes(type)) {
      return res.status(400).json({ error: "طلب غير صالح" });
    }
    const snap = await adminDb.collection("dailyCounters").doc(`${route}_${type}_${businessDay()}`).get();
    return res.status(200).json({ next: (snap.exists ? snap.data().value : 0) + 1 });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
