const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { addPayment, voidPayment, summarize } = require("../../../lib/payments");
const { adminDb } = require("../../../lib/firebaseAdmin");
const { bumpVersions } = require("../../../lib/versions");

// Accountant only — payments are invisible to every other role.
//   GET  /api/payments/:orderId                       → { payments, summary }
//   POST /api/payments/:orderId  { ref, bank, amount, date, note?, requestId }
//   POST /api/payments/:orderId  { action: "void", paymentId, reason }
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    res.setHeader("Cache-Control", "no-store");
    const orderId = String(req.query.orderId || "");

    if (req.method === "GET") {
      const [orderSnap, paySnap] = await Promise.all([
        adminDb.collection("orders").doc(orderId).get(),
        adminDb.collection("invoicePayments").doc(orderId).get(),
      ]);
      if (!orderSnap.exists) return res.status(404).json({ error: "الفاتورة غير موجودة" });
      const doc = paySnap.exists ? paySnap.data() : null;
      return res.status(200).json({ payments: doc?.payments || [], summary: summarize(orderSnap.data(), doc) });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const result = body.action === "void" ? await voidPayment(decoded, orderId, body) : await addPayment(decoded, orderId, body);
      if (!result.duplicate) await bumpVersions(["payments"]);
      return res.status(body.action === "void" || result.duplicate ? 200 : 201).json(result);
    }

    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    return sendError(res, err);
  }
}
