const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

// Public on purpose — clients browse this catalog from /new-order with no login.
// Only active products are returned by default so discontinued items disappear
// from the ordering form without deleting their history from past orders.
// Passing ?all=1 also returns inactive products, but that view is staff-only.
//
// Each product has a separate price per route (prices.car1 / prices.car2),
// set by the supervisor. Passing ?route=car1|car2 resolves that route's
// price into a plain `price` field (so calling code doesn't need to know
// about the prices object at all) — used by /new-order once it knows
// which route the entered client ID belongs to. Without ?route, the raw
// `prices` object is returned as-is (used by the staff catalog manager,
// which needs to see/edit both).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const includeInactive = req.query.all === "1";
    if (includeInactive) {
      await requireUser(req); // staff-only view of the full catalog
    }

    const { route } = req.query;
    if (route && !["car1", "car2"].includes(route)) {
      return res.status(400).json({ error: 'route يجب أن يكون "car1" أو "car2"' });
    }

    let query = adminDb.collection("products").orderBy("name");
    if (!includeInactive) {
      query = query.where("active", "==", true);
    }
    const snap = await query.get();
    let products = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (route) {
      products = products.map((p) => ({ ...p, price: p.prices?.[route] ?? null }));
    }

    return res.status(200).json({ products });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
