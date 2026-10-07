const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { addPayment, voidPayment, editPayment, summarize } = require("../../../lib/payments");
const { adminDb } = require("../../../lib/firebaseAdmin");
const { bumpVersions } = require("../../../lib/versions");

// Accountant only — payments are invisible to every other role.
//   GET  /api/payments/:orderId                       → { payments, summary }
//   POST /api/payments/:orderId  { ref, bank, amount, date, note?, requestId, confirmSimilar? }
//        → 409 { needsConfirm, similar } when another payment's reference
//          ends in the same 4 digits; resend with confirmSimilar: true to save.
//   POST /api/payments/:orderId  { action: "void", paymentId, reason }
//   POST /api/payments/:orderId  { action: "edit", paymentId, ref, bank, amount, date, note? }
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
      const run = { void: voidPayment, edit: editPayment }[body.action] || addPayment;
      const result = await run(decoded, orderId, body);
      if (result.needsConfirm) {
        return res.status(409).json({
          error: "آخر 4 أرقام من رقم العملية تطابق دفعة مسجلة من قبل — راجعها قبل الاعتماد",
          needsConfirm: true,
          similar: result.similar,
        });
      }
      if (!result.duplicate) await bumpVersions(["payments"]);
      return res.status(body.action || result.duplicate ? 200 : 201).json(result);
    }

    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    return sendError(res, err);
  }
}
