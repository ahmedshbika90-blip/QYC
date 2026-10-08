const { requireUser } = require("../../lib/apiAuth");
const { getAllVersions } = require("../../lib/versions");
const { reportServerError } = require("../../lib/monitor");

// The "has anything changed?" check used by open screens: returns the
// change counters only (plain numbers, no business data). 1 read.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    await requireUser(req);
    const v = await getAllVersions();
    const versions = {};
    for (const k of ["orders_car1", "orders_car2", "requests", "inventory", "clients", "shipmentRequests", "payments", "competitors", "places", "stockCheck"])
      versions[k] = v[k] || 0;
    return res.status(200).json({ versions });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
