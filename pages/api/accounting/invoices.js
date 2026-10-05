const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { presentOrder } = require("../../../lib/invoiceLock");
const { paymentDocsFor, summarize } = require("../../../lib/payments");
const { ROUTES } = require("../../../lib/roles");

const DEFAULT_WINDOW_DAYS = 30;
const PAGE_SIZE = 100;
const STATUSES = ["unpaid", "partial", "paid", "over", "cancelled", "cancelledPaid"];

// The accountant's invoice list: every route, newest first, within a date
// window, each with its payment summary. Read-only — no cost, no edit
// history (presentOrder strips them), and only the client fields an
// accountant needs (name, store), not the full client record.
//   GET /api/accounting/invoices?from&to&route&pay=unpaid|partial|paid|...&cursor
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    res.setHeader("Cache-Control", "no-store");

    const { from, to, route, pay, cursor } = req.query;
    if (route && !ROUTES.includes(route)) return res.status(400).json({ error: "المسار غير صالح" });
    if (pay && !STATUSES.includes(pay)) return res.status(400).json({ error: "حالة الدفع غير صالحة" });

    let q = adminDb.collection("orders").orderBy("createdAt", "desc");
    if (route) q = q.where("route", "==", route);
    const fromIso = from ? new Date(String(from)) : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 3600e3);
    if (isNaN(fromIso)) return res.status(400).json({ error: "تاريخ غير صالح" });
    q = q.where("createdAt", ">=", fromIso.toISOString());
    if (to) {
      const t = new Date(String(to));
      if (isNaN(t)) return res.status(400).json({ error: "تاريخ غير صالح" });
      t.setHours(23, 59, 59, 999);
      q = q.where("createdAt", "<=", t.toISOString());
    }
    if (cursor) q = q.startAfter(String(cursor));
    const snap = await q.limit(PAGE_SIZE).get();

    const raw = snap.docs.map((d) => presentOrder(d.id, d.data(), decoded.role));
    const nextCursor = raw.length === PAGE_SIZE ? raw[raw.length - 1].createdAt : null;

    const clientIds = [...new Set(raw.map((o) => o.clientId).filter(Boolean))];
    const [payDocs, clientSnaps] = await Promise.all([
      paymentDocsFor(raw.map((o) => o.id)),
      clientIds.length ? adminDb.getAll(...clientIds.map((id) => adminDb.collection("clients").doc(String(id)))) : [],
    ]);
    const clients = {};
    clientSnaps.forEach((s) => {
      if (s.exists) clients[s.id] = { name: s.data().name || "", storeName: s.data().storeName || "" };
    });

    let invoices = raw.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      route: o.route,
      status: o.status,
      clientId: o.clientId,
      client: clients[o.clientId] || null,
      subtotal: o.subtotal,
      discount: o.discount,
      total: o.total,
      itemCount: (o.items || []).length,
      payment: summarize(o, payDocs[o.id]),
    }));
    if (pay) invoices = invoices.filter((i) => i.payment.status === pay);

    return res.status(200).json({ invoices, nextCursor });
  } catch (err) {
    return sendError(res, err);
  }
}
