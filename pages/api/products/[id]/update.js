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
    const { name, price, unit, category, active } = req.body || {};

    const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    if (name !== undefined) updates.name = name;
    if (unit !== undefined) updates.unit = unit;
    if (category !== undefined) updates.category = category;
    if (active !== undefined) updates.active = Boolean(active);
    if (price !== undefined) {
      const numericPrice = Number(price);
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: "السعر يجب أن يكون رقمًا موجبًا" });
      }
      updates.price = numericPrice;
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
