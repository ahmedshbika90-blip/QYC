const { adminDb } = require("../../lib/firebaseAdmin");
const { requireUser } = require("../../lib/apiAuth");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

// One number per role, meant to answer "is there anything I need to act
// on right now" — shown as a red dot on the relevant nav link and in the
// full-screen prompt shown once per session. Every query here is an
// equality-only filter on a collection that stays small (pending items
// only ever accumulate until someone acts on them), so no pagination and
// no composite index is needed.
//
//  - supervisor: change requests awaiting a decision, plus goods-received
//    documents awaiting approval.
//  - warehouse_keeper: shipment requests ready to fulfill.
//  - agent_car1: car2's loading requests awaiting their approval, plus
//    their OWN loading/offloading documents awaiting their confirmation.
//  - agent_car2: just their own pending confirmations (they never approve
//    anything themselves).
//  - depot_viewer: always 0 — view-only, nothing to act on.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const role = decoded.role;
    let count = 0;

    if (role === "supervisor") {
      const [pendingRequests, pendingReceived] = await Promise.all([
        adminDb.collection("changeRequests").where("status", "==", "pending").get(),
        adminDb.collection("inventoryDocs").where("type", "==", "received").where("status", "==", "pending").get(),
      ]);
      count = pendingRequests.size + pendingReceived.size;
    } else if (role === "warehouse_keeper") {
      const pendingWarehouse = await adminDb
        .collection("shipmentRequests")
        .where("status", "==", "pending_warehouse")
        .get();
      count = pendingWarehouse.size;
    } else if (ROLE_TO_ROUTE[role]) {
      const myRoute = ROLE_TO_ROUTE[role];
      const queries = [
        adminDb.collection("inventoryDocs").where("route", "==", myRoute).where("status", "==", "pending").get(),
      ];
      if (role === "agent_car1") {
        queries.push(
          adminDb.collection("shipmentRequests").where("route", "==", "car2").where("status", "==", "pending_car1").get()
        );
      }
      const snaps = await Promise.all(queries);
      count = snaps.reduce((sum, snap) => sum + snap.size, 0);
    }
    // Any other role (e.g. depot_viewer): count stays 0.

    return res.status(200).json({ count });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
