const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

// Staff-only product catalog (every caller must be logged in).
// Only active products are returned by default; ?all=1 includes inactive
// ones (used by the catalog manager and warehouse pages).
//
// Each product has a separate price per route (prices.car1 / prices.car2).
// Passing ?route=car1|car2 also resolves that route's price into a plain
// `price` field, for callers that only care about one route.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const includeInactive = req.query.all === "1";

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

    // The warehouse keeper manages the depot only: no selling prices and
    // no live car stock — just depot balances.
    if (decoded.role === "warehouse_keeper") {
      products = products.map(({ prices, stock, ...rest }) => ({
        ...rest,
        stock: { depot: stock?.depot ?? 0 },
      }));
    }

    return res.status(200).json({ products });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
