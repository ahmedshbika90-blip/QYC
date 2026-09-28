const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

const DEFAULT_WINDOW_DAYS = 7;
const PAGE_SIZE = 100;

// Invoices within a date period: the last 7 days by default (the app also
// offers 2 weeks and a month), newest first. PAGE_SIZE is a safety cap
// inside the period — "load more" fetches the rest — so one unusually busy
// stretch can never turn a single dashboard load into thousands of reads.
// Uses the existing (route, createdAt) index.
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

    const { status, from, to, cursor, route } = req.query;
    if (status) {
      query = query.where("status", "==", status);
    }

    // Supervisor can narrow to one route server-side, so "30 invoices"
    // means 30 of that route — not 30 mixed, then filtered down.
    if (!restrictedRoute && route) {
      if (!["car1", "car2"].includes(route)) {
        return res.status(400).json({ error: "المسار غير صالح" });
      }
      query = query.where("route", "==", route);
    }

    const effectiveFrom = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    query = query.where("createdAt", ">=", effectiveFrom);

    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query = query.where("createdAt", "<=", toDate.toISOString());
    }

    if (cursor) {
      query = query.startAfter(cursor);
    }

    query = query.limit(PAGE_SIZE);

    const snap = await query.get();
    const orders = snap.docs.map((doc) => {
      const data = doc.data();
      // Edit history is supervisor-only — same rule as the single-invoice
      // endpoint. Agents get a lightweight `edited` flag instead (just
      // enough to show a note on the card) without the actual history.
      const edited = Boolean(data.editHistory?.length);
      if (decoded.role !== "supervisor") delete data.editHistory;
      return { id: doc.id, ...data, edited };
    });

    // A same-size page suggests there may be more beyond it — the client
    // passes this back as `cursor` to load the next page ("تحميل المزيد").
    const nextCursor = orders.length === PAGE_SIZE ? orders[orders.length - 1].createdAt : null;

    return res.status(200).json({ orders, nextCursor });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
