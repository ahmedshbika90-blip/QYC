const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");

const DEFAULT_WINDOW_DAYS = 7;
const PAGE_SIZE = 100;

// Supervisor-only. Two bounded query shapes, no composite indexes needed:
//  ?status=pending — the few requests awaiting a decision (equality only)
//  history (default) — decided requests by decision date, last 7 days
//    unless ?from is given, 100 per page with a cursor. Car / outcome /
//    type filters apply in memory within that bounded window.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);

    const { status, route, type, from, to, cursor } = req.query;
    const coll = adminDb.collection("changeRequests");
    let requests;
    let nextCursor = null;

    if (status === "pending") {
      const snap = await coll.where("status", "==", "pending").get();
      requests = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    } else {
      let query = coll.orderBy("decidedAt", "desc");
      const effectiveFrom = from
        ? new Date(from).toISOString()
        : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      query = query.where("decidedAt", ">=", effectiveFrom);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query = query.where("decidedAt", "<=", toDate.toISOString());
      }
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.limit(PAGE_SIZE).get();
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      nextCursor = raw.length === PAGE_SIZE ? raw[raw.length - 1].decidedAt : null;
      requests = status ? raw.filter((r) => r.status === status) : raw;
    }

    if (route) requests = requests.filter((r) => r.route === route);
    if (type) requests = requests.filter((r) => r.type === type);

    return res.status(200).json({ requests, nextCursor });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
