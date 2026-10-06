const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { findByRef, summarize, paymentDocsFor } = require("../../../lib/payments");
const { BANK_LABELS } = require("../../../lib/paymentsShared");

// Accountant: which invoice(s) carry a payment with this transaction
// reference (رقم العملية). 4 document reads at most — one per bank.
//   GET /api/accounting/find-ref?ref=12345
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    res.setHeader("Cache-Control", "no-store");
    const hits = await findByRef(req.query.ref);
    if (!hits.length) return res.status(200).json({ matches: [] });
    const ids = [...new Set(hits.map((h) => h.orderId))];
    const [orderSnaps, payDocs] = await Promise.all([
      adminDb.getAll(...ids.map((id) => adminDb.collection("orders").doc(id))),
      paymentDocsFor(ids),
    ]);
    const orders = {};
    orderSnaps.forEach((s) => s.exists && (orders[s.id] = s.data()));
    const clientIds = [...new Set(Object.values(orders).map((o) => o.clientId).filter(Boolean))];
    const clientSnaps = clientIds.length ? await adminDb.getAll(...clientIds.map((id) => adminDb.collection("clients").doc(String(id)))) : [];
    const names = {};
    clientSnaps.forEach((s) => s.exists && (names[s.id] = s.data().name || ""));
    const matches = hits
      .filter((h) => orders[h.orderId])
      .map((h) => {
        const o = orders[h.orderId];
        const p = (payDocs[h.orderId]?.payments || []).find((x) => x.id === h.paymentId);
        return {
          orderId: h.orderId,
          bank: h.bank,
          bankLabel: BANK_LABELS[h.bank] || h.bank,
          ref: h.ref,
          amount: p?.amount ?? null,
          date: p?.date ?? null,
          clientName: names[o.clientId] || null,
          clientId: o.clientId || null,
          createdAt: o.createdAt,
          route: o.route,
          payment: summarize(o, payDocs[h.orderId]),
        };
      });
    return res.status(200).json({ matches });
  } catch (err) {
    return sendError(res, err);
  }
}
