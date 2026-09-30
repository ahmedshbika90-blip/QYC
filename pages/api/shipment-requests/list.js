const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

// Query shapes:
//  ?scope=todecide — car1 only: car2's requests awaiting car1's approval.
//  ?scope=own      — the signed-in agent's own requests (any status).
//  ?status=pending_warehouse — the warehouse keeper's fulfillment queue.
//  default (supervisor) — everything, optionally filtered by route/status.
// All equality-only filters, sorted in memory — no composite index needed,
// and the collection stays small (open requests accumulate only until
// fulfilled/rejected, and this doesn't yet page through old history).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { scope, status, route } = req.query;
    const coll = adminDb.collection("shipmentRequests");
    let query;

    if (scope === "todecide") {
      if (decoded.role !== "agent_car1") {
        return res.status(403).json({ error: "غير مصرح" });
      }
      query = coll.where("route", "==", "car2").where("status", "==", "pending_car1");
    } else if (scope === "own") {
      const myRoute = ROLE_TO_ROUTE[decoded.role];
      if (!myRoute) return res.status(403).json({ error: "غير مصرح" });
      query = coll.where("requestedBy", "==", decoded.uid);
    } else if (status === "pending_warehouse") {
      if (!["warehouse_keeper", "supervisor"].includes(decoded.role)) {
        return res.status(403).json({ error: "غير مصرح" });
      }
      query = coll.where("status", "==", "pending_warehouse");
    } else {
      if (decoded.role !== "supervisor") return res.status(403).json({ error: "غير مصرح" });
      query = coll;
      if (status) query = query.where("status", "==", status);
      if (route) query = query.where("route", "==", route);
    }

    const snap = await query.get();
    let requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

    return res.status(200).json({ requests });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
