const { adminDb } = require("./firebaseAdmin");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

/**
 * The one way invoices are selected for a report — shared by the sales
 * report, the report-sharing lock, and the operating margin, so "the
 * invoices in this report" always means exactly the same set.
 *
 * Agents are always restricted to their own route (server-side); the
 * supervisor may pick one route or both. The date range is part of the
 * query itself (uses the existing route + createdAt index), so reads are
 * bounded by the period chosen.
 */
async function fetchReportOrders(decoded, { route, from, to }) {
  let query = adminDb.collection("orders");
  const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
  let effectiveRoute = null;

  if (restrictedRoute) {
    effectiveRoute = restrictedRoute;
  } else if (decoded.role === "supervisor") {
    if (route) {
      if (!["car1", "car2"].includes(route)) {
        const err = new Error("المسار غير صالح");
        err.statusCode = 400;
        throw err;
      }
      effectiveRoute = route;
    }
  } else {
    const err = new Error("غير مصرح: الصلاحية غير معروفة");
    err.statusCode = 403;
    throw err;
  }

  if (effectiveRoute) query = query.where("route", "==", effectiveRoute);
  query = query.orderBy("createdAt", "desc");
  if (from) query = query.where("createdAt", ">=", new Date(from).toISOString());
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999); // include the whole "to" day
    query = query.where("createdAt", "<=", toDate.toISOString());
  }

  const snap = await query.get();
  return {
    route: effectiveRoute || "all",
    orders: snap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() })),
  };
}

module.exports = { fetchReportOrders };
