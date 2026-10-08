const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createOnce } = require("../../../lib/idempotentCreate");
const { bumpVersions } = require("../../../lib/versions");
const { parseDecimal, parseQty } = require("../../../lib/qty");
const { PRODUCT_CATEGORIES, PRODUCT_UNITS } = require("../../../lib/constants");
const { cleanEnglishName } = require("../../../lib/englishName");
const { reportServerError } = require("../../../lib/monitor");

function fail(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// Money: decimals allowed; Arabic digits and "٫" / "," accepted and
// stored as a plain English number.
function parseMoney(value, label) {
  const num = parseDecimal(value);
  if (!Number.isFinite(num) || num < 0) throw fail(`${label} يجب أن يكون رقمًا موجبًا`);
  return Math.round(num * 100) / 100;
}

// Quantities: whole numbers only (empty = 0).
function parseWhole(value, label) {
  if (value === undefined || value === null || value === "") return 0;
  const n = parseQty(value);
  if (!Number.isInteger(n) || n < 0) throw fail(`${label} يجب أن يكون عددًا صحيحًا بدون كسور`);
  return n;
}

// Products carry a separate price per route (car1 / car2), set by the
// supervisor — the same product can legitimately cost different amounts
// depending on which van/route is selling it.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);

    const { name, nameEn, unit, category, priceCar1, priceCar2, avgCost, openingStock, minStock, requestId } = req.body || {};
    const cleanEn = cleanEnglishName(nameEn) || "";
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }

    const cleanName = String(name || "").trim();
    if (!cleanName) throw fail("اسم المنتج مطلوب");
    if (!PRODUCT_CATEGORIES.includes(category)) throw fail("اختر نوع المنتج من القائمة");
    if (!PRODUCT_UNITS.includes(unit)) throw fail("اختر الوحدة من القائمة");
    if (avgCost === undefined || avgCost === null || avgCost === "") throw fail("تكلفة الوحدة مطلوبة");

    const productDoc = {
      name: cleanName,
      nameEn: cleanEn,
      unit,
      category,
      prices: {
        car1: parseMoney(priceCar1, "سعر الجملة"),
        car2: parseMoney(priceCar2, "سعر التجزئة"),
      },
      // Unit cost used for the operating margin. Updated to the latest
      // supplier price every time a goods-received document is approved.
      avgCost: parseMoney(avgCost, "تكلفة الوحدة"),
      // Depot stock starts at the opening balance the supervisor sets on
      // creation; car1/car2 stock always starts at 0 since goods only
      // ever reach a car through a confirmed Loading document, never
      // directly. "damaged" is a write-off bucket — goods moved here are
      // no longer sellable and no longer counted as available stock
      // anywhere else (see /api/inventory/damage.js).
      stock: { depot: parseWhole(openingStock, "الرصيد الافتتاحي"), car1: 0, car2: 0, damaged: 0 },
      // Below this depot quantity, the product shows a low-stock warning
      // to the warehouse keeper and on the products screen. 0 = no alert.
      minStock: parseWhole(minStock, "حد التنبيه"),
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    };

    const ref = adminDb.collection("products").doc(requestId);
    const result = await createOnce(ref, productDoc, { ownerField: "createdBy", ownerId: decoded.uid });
    if (!result.duplicate) {
      // Opening balance → stock ledger (lib/stockCheck.js).
      const opening = Number(result.data?.stock?.depot) || 0;
      if (opening) await adminDb.collection("stockLedger").doc(`opening_${ref.id}`).set({ at: result.data.createdAt || new Date().toISOString(), kind: "opening", entries: [{ productId: ref.id, field: "depot", delta: opening }] });
      await bumpVersions(["products"]); // product list caches (lib/serverCache.js)
    }
    return res.status(result.duplicate ? 200 : 201).json({ id: ref.id, ...result.data, duplicate: result.duplicate });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
