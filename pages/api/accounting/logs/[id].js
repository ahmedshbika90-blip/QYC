const { requireUser, requireRole, sendError } = require("../../../../lib/apiAuth");
const { loadLog, addLogPayment, allocateLogPayment, voidLogPayment } = require("../../../../lib/logPayments");
const { agentsDirectory, attachMargins } = require("../../../../lib/accountingViews");
const { bumpVersions } = require("../../../../lib/versions");
const { reportServerError } = require("../../../../lib/monitor");

// One invoice log (van + day).
//   GET  → { log, invoices, payments, people }
//   POST { action: "pay", ref, bank, amount, date, note?, requestId, confirmSimilar? }
//        { action: "allocate", paymentId, allocations: { orderId: amount } }
//        { action: "void", paymentId, reason }
//   "pay" answers 409 { needsConfirm, similar } when the last 4 digits match an earlier payment.
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    const logId = String(req.query.id || "");
    if (req.method === "GET") {
      const [data, dir] = await Promise.all([loadLog(logId), agentsDirectory()]);
      const [log] = await attachMargins([data.log]);
      return res.status(200).json({ ...data, log, people: dir[data.log.route] || [] });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
    const body = req.body || {};
    let result;
    if (body.action === "pay") {
      result = await addLogPayment(decoded, logId, body);
      if (result.needsConfirm) {
        return res.status(409).json({ error: "آخر 4 أرقام من رقم العملية تطابق دفعة مسجلة من قبل — راجعها قبل الاعتماد", needsConfirm: true, similar: result.similar });
      }
    } else if (body.action === "allocate") result = await allocateLogPayment(decoded, body.paymentId, body);
    else if (body.action === "void") result = await voidLogPayment(decoded, body.paymentId, body);
    else return res.status(400).json({ error: "إجراء غير معروف" });
    if (!result.duplicate) await bumpVersions(["payments"]);
    const fresh = await loadLog(logId);
    const [log] = await attachMargins([fresh.log]);
    return res.status(body.action === "pay" && !result.duplicate ? 201 : 200).json({ ...result, ...fresh, log });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
