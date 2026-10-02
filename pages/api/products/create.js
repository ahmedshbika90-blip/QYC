const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createOnce } = require("../../../lib/idempotentCreate");

// Products carry a separate price per route (car1 / car2), set by the
// supervisor — the same product can legitimately cost different amounts
// depending on which van/route is selling it.
function parsePrice(value, label) {
  const num = Number(value);
  if (value === undefined || value === null || Number.isNaN(num) || num < 0) {
    const err = new Error(`${label} يجب أن يكون رقمًا موجبًا`);
    err.statusCode = 400;
    throw err;
  }
  return num;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);

    const { name, unit, category, priceCar1, priceCar2, openingStock, minStock, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }


    if (!name || !unit || priceCar1 === undefined || priceCar2 === undefined) {
      return res.status(400).json({
        error: "الاسم والوحدة وسعر كل سيارة كلها مطلوبة",
      });
    }

    let openingQty = 0;
    if (openingStock !== undefined && openingStock !== null && openingStock !== "") {
      openingQty = Number(openingStock);
      if (Number.isNaN(openingQty) || openingQty < 0) {
        return res.status(400).json({ error: "الرصيد الافتتاحي يجب أن يكون رقمًا موجبًا" });
      }
      openingQty = Math.round(openingQty * 100) / 100;
    }

    let minStockQty = 0;
    if (minStock !== undefined && minStock !== null && minStock !== "") {
      minStockQty = Number(minStock);
      if (Number.isNaN(minStockQty) || minStockQty < 0) {
        return res.status(400).json({ error: "حد التنبيه يجب أن يكون رقمًا موجبًا" });
      }
    }

    const productDoc = {
      name,
      unit,
      category: category || null,
      prices: {
        car1: parsePrice(priceCar1, "سعر الجملة"),
        car2: parsePrice(priceCar2, "سعر التجزئة"),
      },
      // Depot stock starts at the opening balance the supervisor sets on
      // creation; car1/car2 stock always starts at 0 since goods only
      // ever reach a car through a confirmed Loading document, never
      // directly. "damaged" is a write-off bucket — goods moved here are
      // no longer sellable and no longer counted as available stock
      // anywhere else (see /api/inventory/damage.js).
      stock: { depot: openingQty, car1: 0, car2: 0, damaged: 0 },
      // Below this depot quantity, the product shows a low-stock warning
      // to the warehouse keeper and on the products screen. 0 = no alert.
      minStock: minStockQty,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    };

    const ref = adminDb.collection("products").doc(requestId);
    const result = await createOnce(ref, productDoc, { ownerField: "createdBy", ownerId: decoded.uid });
    return res.status(result.duplicate ? 200 : 201).json({ id: ref.id, ...result.data, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
