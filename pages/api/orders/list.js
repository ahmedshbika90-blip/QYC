const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");
const { presentOrder } = require("../../../lib/invoiceLock");
const { paymentDocsFor, publicPayment } = require("../../../lib/payments");
const { reportServerError } = require("../../../lib/monitor");

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

    const restrictedRoute = decoded.route;
    if (restrictedRoute) {
      query = query.where("route", "==", restrictedRoute);
    } else if (decoded.role !== "manager") {
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
    // presentOrder: lock state from the server clock; edit history and
    // cost data removed for everyone but the supervisor.
    const orders = snap.docs.map((doc) => presentOrder(doc.id, doc.data(), decoded.role));
    // Amount paid so far on each invoice (one batched read for the page).
    const payDocs = await paymentDocsFor(orders.map((o) => o.id));
    orders.forEach((o) => {
      o.payment = publicPayment(o, payDocs[o.id]);
    });

    // A same-size page suggests there may be more beyond it — the client
    // passes this back as `cursor` to load the next page ("تحميل المزيد").
    const nextCursor = orders.length === PAGE_SIZE ? orders[orders.length - 1].createdAt : null;

    return res.status(200).json({ orders, nextCursor });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
