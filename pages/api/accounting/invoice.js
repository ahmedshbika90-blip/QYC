const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { presentOrder } = require("../../../lib/invoiceLock");
const { reportServerError } = require("../../../lib/monitor");

// One invoice, read-only, for the accountant's invoice page. Payments come
// separately from /api/payments/:orderId.
//   GET /api/accounting/invoice?id=...
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    res.setHeader("Cache-Control", "no-store");
    const id = String(req.query.id || "");
    if (!id) return res.status(400).json({ error: "الفاتورة غير صالحة" });
    const snap = await adminDb.collection("orders").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "الفاتورة غير موجودة" });
    const order = presentOrder(snap.id, snap.data(), decoded.role);
    const c = order.clientId ? await adminDb.collection("clients").doc(String(order.clientId)).get() : null;
    const d = c && c.exists ? c.data() : null;
    const client = d ? { id: c.id, name: d.name || "", storeName: d.storeName || "", deliveryRoute: d.deliveryRoute || "", location: d.location || "", route: d.route } : null;
    // Agents' notes and change requests aren't the accountant's business.
    const { notes, pendingRequest, lastRequest, ...rest } = order;
    return res.status(200).json({ order: rest, client });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
