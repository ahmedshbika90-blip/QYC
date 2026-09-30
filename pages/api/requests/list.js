const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

const DEFAULT_WINDOW_DAYS = 7;
const PAGE_SIZE = 100;
const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

// Two shapes:
//  - Supervisor: everything, filterable by route/type/status, paginated
//    history by decision date (unchanged from before).
//  - Agent: their OWN requests only (equality on requestedBy — always
//    bounded, since one agent's requests never really pile up), any
//    status, no pagination needed for the same reason. This is what
//    powers the agent-facing "طلباتي" tab on /requests.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { status, route, type, from, to, cursor } = req.query;
    const coll = adminDb.collection("changeRequests");

    const myRoute = ROLE_TO_ROUTE[decoded.role];
    if (myRoute) {
      let query = coll.where("requestedBy", "==", decoded.uid);
      if (status) query = query.where("status", "==", status);
      const snap = await query.get();
      let requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      requests.sort((a, b) => (b.decidedAt || b.requestedAt).localeCompare(a.decidedAt || a.requestedAt));
      if (type) requests = requests.filter((r) => r.type === type);
      return res.status(200).json({ requests, nextCursor: null });
    }

    if (decoded.role !== "supervisor") {
      return res.status(403).json({ error: "غير مصرح" });
    }

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
