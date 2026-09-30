const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);

    const { id } = req.query;
    const { name, unit, category, active, priceCar1, priceCar2, depotStock, avgCost, minStock } = req.body || {};

    const ref = adminDb.collection("products").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }
    const product = snap.data();

    const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    if (name !== undefined) updates.name = name;
    if (unit !== undefined) updates.unit = unit;
    if (category !== undefined) updates.category = category;
    if (active !== undefined) updates.active = Boolean(active);

    if (priceCar1 !== undefined || priceCar2 !== undefined) {
      const nextPrices = { ...(product.prices || {}) };
      if (priceCar1 !== undefined) {
        const n = Number(priceCar1);
        if (Number.isNaN(n) || n < 0) {
          return res.status(400).json({ error: "سعر الجملة يجب أن يكون رقمًا موجبًا" });
        }
        nextPrices.car1 = n;
      }
      if (priceCar2 !== undefined) {
        const n = Number(priceCar2);
        if (Number.isNaN(n) || n < 0) {
          return res.status(400).json({ error: "سعر التجزئة يجب أن يكون رقمًا موجبًا" });
        }
        nextPrices.car2 = n;
      }
      updates.prices = nextPrices;
    }

    // Depot stock can be corrected directly by the supervisor (e.g. an
    // opening balance for a product that existed before inventory
    // tracking was turned on, or fixing a real-world count mismatch).
    // car1/car2 stock is deliberately NOT editable here — those only ever
    // change through a confirmed Loading/Offloading document, so there's
    // always a clear record of how stock moved between the depot and a
    // car, rather than a silent manual override.
    // Unit cost used for the operating margin. Normally maintained
    // automatically (weighted average of approved supplier prices); set it
    // here to give existing/opening stock a cost.
    if (avgCost !== undefined && avgCost !== "") {
      const n = Number(avgCost);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ error: "تكلفة الوحدة يجب أن تكون رقمًا موجبًا" });
      }
      updates.avgCost = Math.round(n * 100) / 100;
    }

    if (depotStock !== undefined) {
      const n = Number(depotStock);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ error: "رصيد المخزن يجب أن يكون رقمًا موجبًا" });
      }
      updates["stock.depot"] = n;
    }

    if (minStock !== undefined && minStock !== "") {
      const n = Number(minStock);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ error: "حد التنبيه يجب أن يكون رقمًا موجبًا" });
      }
      updates.minStock = n;
    }

    await ref.update(updates);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
