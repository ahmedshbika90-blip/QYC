const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

const DEFAULT_WINDOW_DAYS = 30;
const PAGE_SIZE = 200;

// Two query shapes, both bounded:
//
// 1. ?status=pending — the "awaiting confirmation/approval" banners. Pending
//    documents are always a handful, so this is equality-only filters
//    (no orderBy → no composite index needed), sorted in memory.
//
// 2. History (default) — last 30 days unless ?from is given, newest first,
//    200 per page with a cursor. Agents are restricted to their own route
//    server-side (security); for supervisor/warehouse keeper, the optional
//    type/route/status filters are applied in memory within that already-
//    bounded window, which avoids needing a composite index for every
//    filter combination.
//
// Agent route + date history uses one composite index: inventoryDocs
// (route ASC, createdAt DESC) — see firestore.indexes.json.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (!restrictedRoute && !["supervisor", "warehouse_keeper"].includes(decoded.role)) {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    const { status, type, route, from, to, cursor, excludePending } = req.query;
    const coll = adminDb.collection("inventoryDocs");

    let docs;
    let nextCursor = null;

    if (status === "pending") {
      let query = coll.where("status", "==", "pending");
      if (restrictedRoute) query = query.where("route", "==", restrictedRoute);
      const snap = await query.get();
      docs = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else {
      let query = coll.orderBy("createdAt", "desc");
      if (restrictedRoute) query = query.where("route", "==", restrictedRoute);

      const effectiveFrom =
        from || new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      query = query.where("createdAt", ">=", effectiveFrom);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query = query.where("createdAt", "<=", toDate.toISOString());
      }
      if (cursor) query = query.startAfter(cursor);
      query = query.limit(PAGE_SIZE);

      const snap = await query.get();
      const raw = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Cursor is based on the raw page, before in-memory filtering, so
      // "load more" still walks the full window correctly.
      nextCursor = raw.length === PAGE_SIZE ? raw[raw.length - 1].createdAt : null;
      docs = raw;
      if (status) docs = docs.filter((d) => d.status === status);
      if (excludePending === "1") docs = docs.filter((d) => d.status !== "pending");
    }

    if (type) docs = docs.filter((d) => d.type === type);
    if (route && !restrictedRoute) docs = docs.filter((d) => d.route === route);

    // Supplier price is supervisor-only — never sent to anyone else.
    if (decoded.role !== "supervisor") {
      docs = docs.map((d) => ({ ...d, items: d.items.map(({ costPrice, ...rest }) => rest) }));
    }

    return res.status(200).json({ docs, nextCursor });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
