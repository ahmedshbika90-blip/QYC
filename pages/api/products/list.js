const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");
const { cachedByVersions } = require("../../../lib/serverCache");

// Everything that can change a product (catalog edits, stock, average cost)
// bumps one of these counters; see lib/serverCache.js.
const PRODUCT_KEYS = ["products", "orders_car1", "orders_car2", "inventory", "transfers", "shipmentRequests"];
const CACHE_MS = 90 * 1000;

// Every product, read once per change (or per 90 s) on this server instance.
// Never mutated below — each request builds new objects from it.
const allProducts = () =>
  cachedByVersions("products", PRODUCT_KEYS, CACHE_MS, async () => {
    const snap = await adminDb.collection("products").orderBy("name").get();
    return snap.docs.map((doc) => Object.freeze({ id: doc.id, ...doc.data() }));
  });

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

    // Same set as before: ordered by name, active === true unless ?all=1.
    let products = (await allProducts()).filter((p) => includeInactive || p.active === true);

    // Low-stock flag: depot balance at or below the supervisor's configured
    // threshold. minStock of 0 (the default) means "no alert configured".
    products = products.map((p) => ({
      ...p,
      lowStock: Boolean(p.minStock > 0 && (p.stock?.depot ?? 0) <= p.minStock),
    }));

    if (route) {
      products = products.map((p) => ({ ...p, price: p.prices?.[route] ?? null }));
    }

    // Average supplier cost is supervisor-only.
    if (decoded.role !== "manager") {
      products = products.map(({ avgCost, ...rest }) => rest);
    }

    // A sales agent sees only his own van and the depot; a sales supervisor
    // sees every van. Removed here on the server, not just hidden in the
    // app, so it can't be read from the network response either.
    if (decoded.route && !decoded.salesSupervisor) {
      products = products.map((p) => {
        if (!p.stock) return p;
        const stock = { depot: p.stock.depot ?? 0, [decoded.route]: p.stock[decoded.route] ?? 0 };
        return { ...p, stock };
      });
    }

    // The warehouse keeper manages the depot only: no selling prices and
    // no live car stock — just depot and damaged-goods balances.
    if (decoded.role === "warehouse_keeper") {
      products = products.map(({ prices, stock, ...rest }) => ({
        ...rest,
        stock: { depot: stock?.depot ?? 0, damaged: stock?.damaged ?? 0 },
      }));
    }

    // View-only role over the main depot: same restricted shape as the
    // warehouse keeper, but this role never receives write access anyway.
    if (decoded.role === "depot_viewer") {
      products = products.map(({ prices, stock, ...rest }) => ({
        ...rest,
        stock: { depot: stock?.depot ?? 0, damaged: stock?.damaged ?? 0 },
      }));
    }

    return res.status(200).json({ products });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
