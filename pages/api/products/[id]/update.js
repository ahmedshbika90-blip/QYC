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
    const { name, unit, category, active, priceCar1, priceCar2 } = req.body || {};

    const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    if (name !== undefined) updates.name = name;
    if (unit !== undefined) updates.unit = unit;
    if (category !== undefined) updates.category = category;
    if (active !== undefined) updates.active = Boolean(active);

    if (priceCar1 !== undefined || priceCar2 !== undefined) {
      const ref = adminDb.collection("products").doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "المنتج غير موجود" });
      }
      const current = snap.data().prices || {};
      const nextPrices = { ...current };

      if (priceCar1 !== undefined) {
        const n = Number(priceCar1);
        if (Number.isNaN(n) || n < 0) {
          return res.status(400).json({ error: "سعر السيارة ١ يجب أن يكون رقمًا موجبًا" });
        }
        nextPrices.car1 = n;
      }
      if (priceCar2 !== undefined) {
        const n = Number(priceCar2);
        if (Number.isNaN(n) || n < 0) {
          return res.status(400).json({ error: "سعر السيارة ٢ يجب أن يكون رقمًا موجبًا" });
        }
        nextPrices.car2 = n;
      }
      updates.prices = nextPrices;
      await ref.update(updates);
      return res.status(200).json({ ok: true });
    }

    const ref = adminDb.collection("products").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    await ref.update(updates);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
