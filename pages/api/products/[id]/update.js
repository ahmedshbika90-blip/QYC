const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { parseDecimal, parseQty } = require("../../../../lib/qty");
const { PRODUCT_CATEGORIES, PRODUCT_UNITS } = require("../../../../lib/constants");
const { cleanEnglishName } = require("../../../../lib/englishName");
const { bumpVersions } = require("../../../../lib/versions");

function fail(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// Money: decimals allowed; Arabic digits and "٫" / "," accepted.
function parseMoney(value, label) {
  const n = parseDecimal(value);
  if (!Number.isFinite(n) || n < 0) throw fail(`${label} يجب أن يكون رقمًا موجبًا`);
  return Math.round(n * 100) / 100;
}

// Quantities: whole numbers only.
function parseWhole(value, label) {
  const n = parseQty(value);
  if (!Number.isInteger(n) || n < 0) throw fail(`${label} يجب أن يكون عددًا صحيحًا بدون كسور`);
  return n;
}

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);

    const { id } = req.query;
    const { name, nameEn, unit, category, active, priceCar1, priceCar2, depotStock, avgCost, minStock } = req.body || {};

    const ref = adminDb.collection("products").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }
    const product = snap.data();

    const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    if (nameEn !== undefined) updates.nameEn = cleanEnglishName(nameEn);
    if (name !== undefined) {
      const clean = String(name).trim();
      if (!clean) throw fail("اسم المنتج مطلوب");
      updates.name = clean;
    }
    // Type and unit come from fixed lists. Old free-text values stay on
    // the product until it is edited; an edit must choose from the lists.
    if (unit !== undefined) {
      if (!PRODUCT_UNITS.includes(unit)) throw fail("اختر الوحدة من القائمة");
      updates.unit = unit;
    }
    if (category !== undefined) {
      if (!PRODUCT_CATEGORIES.includes(category)) throw fail("اختر نوع المنتج من القائمة");
      updates.category = category;
    }
    if (active !== undefined) updates.active = Boolean(active);

    if (priceCar1 !== undefined || priceCar2 !== undefined) {
      const nextPrices = { ...(product.prices || {}) };
      if (priceCar1 !== undefined) nextPrices.car1 = parseMoney(priceCar1, "سعر الجملة");
      if (priceCar2 !== undefined) nextPrices.car2 = parseMoney(priceCar2, "سعر التجزئة");
      updates.prices = nextPrices;
    }

    // Unit cost used for the operating margin. Normally set automatically
    // to the latest approved supplier price; can be corrected here. It
    // applies to all stock on hand and to sales from now on — invoices
    // already made keep the cost they were sold at.
    if (avgCost !== undefined) {
      if (avgCost === "" || avgCost === null) throw fail("تكلفة الوحدة مطلوبة");
      updates.avgCost = parseMoney(avgCost, "تكلفة الوحدة");
    }

    // Depot stock can be corrected directly by the supervisor (e.g. fixing
    // a real-world count mismatch). car1/car2 stock is deliberately NOT
    // editable here — those only ever change through a confirmed
    // Loading/Offloading document, so there's always a clear record.
    if (depotStock !== undefined) {
      updates["stock.depot"] = parseWhole(depotStock, "رصيد المخزن");
    }

    if (minStock !== undefined && minStock !== "") {
      updates.minStock = parseWhole(minStock, "حد التنبيه");
    }

    await ref.update(updates);
    await bumpVersions(["products"]); // product list caches (lib/serverCache.js)
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
