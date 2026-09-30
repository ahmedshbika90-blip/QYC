const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createMovementDoc } = require("../../../lib/movementDoc");

// Loading: depot -> car (a van heading out for the day/trip).
// Offloading: car -> depot (unsold stock coming back).
// The warehouse keeper enters the quantities either way — submitting this
// form IS their side of the confirmation. Stock doesn't actually move
// until the relevant car agent ALSO confirms (see [id]/confirm.js) — if
// the agent's own count doesn't match, they dispute instead, and nothing
// moves. No cost/price concept here at all; that's specific to goods
// received from a supplier.
//
// This is the DIRECT/manual path. The normal flow is the agent requesting
// the shipment first (see /api/shipment-requests/create.js) and the
// warehouse keeper fulfilling it (/api/shipment-requests/[id]/fulfill.js,
// which creates the exact same kind of document via the shared helper
// below). This route stays available for exceptions — e.g. no matching
// request on file.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["warehouse_keeper"]);

    const { type, route, items, note, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }

    if (!["loading", "offloading"].includes(type)) {
      return res.status(400).json({ error: "نوع الحركة يجب أن يكون تحميل أو تفريغ" });
    }
    if (!["car1", "car2"].includes(route)) {
      return res.status(400).json({ error: "المسار يجب أن يكون جملة أو تجزئة" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "يجب إضافة منتج واحد على الأقل" });
    }
    for (const it of items) {
      if (!it.productId || !it.qty || it.qty <= 0) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية صحيحة" });
      }
    }

    const result = await createMovementDoc({ decoded, type, route, items, note, requestId });
    return res
      .status(result.duplicate ? 200 : 201)
      .json({ id: result.id, dailySeq: result.dailySeq, duplicate: result.duplicate, type });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
