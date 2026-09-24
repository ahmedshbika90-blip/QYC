const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");

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

    const { name, unit, category, priceCar1, priceCar2 } = req.body || {};

    if (!name || !unit || priceCar1 === undefined || priceCar2 === undefined) {
      return res.status(400).json({
        error: "الاسم والوحدة وسعر كل سيارة كلها مطلوبة",
      });
    }

    const productDoc = {
      name,
      unit,
      category: category || null,
      prices: {
        car1: parsePrice(priceCar1, "سعر السيارة ١"),
        car2: parsePrice(priceCar2, "سعر السيارة ٢"),
      },
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    };

    const ref = await adminDb.collection("products").add(productDoc);
    return res.status(201).json({ id: ref.id, ...productDoc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
