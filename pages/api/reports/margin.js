const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { fetchReportOrders } = require("../../../lib/reportQuery");
const { isLocked } = require("../../../lib/invoiceLock");
const { netLines, orderDiscount } = require("../../../lib/invoiceDiscount");
const { reportServerError } = require("../../../lib/monitor");

const DEFAULT_WINDOW_DAYS = 7;
const round = (n) => Math.round(n * 100) / 100;

// Operating margin = selling price − supplier cost, from FINALIZED invoices
// only: locked ones (in a shared report, or older than 9 hours), not
// cancelled. Invoices still editable are excluded (reported as a count), so
// the figure only reflects sales that can't silently change.
//
// Cost comes from each invoice line's saved unit cost (the weighted-average
// supplier cost at the moment of sale). Invoices made before costs were
// tracked have none; for those, the product's current average cost is used
// as an ESTIMATE (flagged). If there's no cost at all, that revenue is
// shown but left out of the margin — never guessed.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);

    const from =
      req.query.from || new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { route, orders } = await fetchReportOrders(decoded, { route: req.query.route, from, to: req.query.to });

    const now = Date.now();
    const active = orders.filter((o) => o.status !== "cancelled");
    // Computed from the LIVE invoices — every non-cancelled one in the
    // period, exactly like the agents' figure — so it moves as the day goes.
    // Invoices that aren't locked yet can still change (an edit or a
    // cancellation), which is why they're counted separately below: the page
    // tells the supervisor how much of the figure is still provisional.
    const finalized = active;
    const notFinalizedCount = active.filter((o) => !isLocked(o, now)).length;

    // Fallback costs only for products that need one (usually none).
    const needFallback = new Set();
    finalized.forEach((o) => o.items.forEach((it) => it.unitCost == null && needFallback.add(it.productId)));
    const fallback = new Map();
    if (needFallback.size) {
      const snaps = await adminDb.getAll(...[...needFallback].map((pid) => adminDb.collection("products").doc(pid)));
      snaps.forEach((s) => {
        if (s.exists && typeof s.data().avgCost === "number") fallback.set(s.id, s.data().avgCost);
      });
    }

    const byProduct = new Map();
    const byRoute = {};
    const totals = { revenue: 0, costedRevenue: 0, cost: 0, uncostedRevenue: 0, estimatedUnits: 0, discount: 0 };

    // Revenue is what the client actually pays: each invoice's discount is
    // spread over its lines in proportion to their value (lib/invoiceDiscount
    // netLines), so per-product revenue — and the margin — is after discount,
    // and the products add up to the invoice totals exactly.
    for (const o of finalized) {
      byRoute[o.route] = byRoute[o.route] || { revenue: 0, costedRevenue: 0, cost: 0 };
      totals.discount += orderDiscount(o);
      for (const it of netLines(o)) {
        const revenue = it.netSubtotal;
        let unitCost = it.unitCost;
        let estimated = false;
        if (unitCost == null && fallback.has(it.productId)) {
          unitCost = fallback.get(it.productId);
          estimated = true;
        }

        const row =
          byProduct.get(it.productId) ||
          { productId: it.productId, name: it.name, unit: it.unit, qty: 0, revenue: 0, costedRevenue: 0, cost: 0, uncostedQty: 0, estimatedQty: 0 };
        row.qty += it.qty;
        row.revenue += revenue;
        totals.revenue += revenue;
        byRoute[o.route].revenue += revenue;

        if (unitCost == null) {
          row.uncostedQty += it.qty;
          totals.uncostedRevenue += revenue;
        } else {
          const cost = unitCost * it.qty;
          row.cost += cost;
          row.costedRevenue += revenue;
          totals.cost += cost;
          totals.costedRevenue += revenue;
          byRoute[o.route].cost += cost;
          byRoute[o.route].costedRevenue += revenue;
          if (estimated) {
            row.estimatedQty += it.qty;
            totals.estimatedUnits += it.qty;
          }
        }
        byProduct.set(it.productId, row);
      }
    }

    const summarize = (x) => {
      const margin = x.costedRevenue - x.cost;
      return {
        revenue: round(x.revenue),
        cost: round(x.cost),
        margin: round(margin),
        marginPct: x.costedRevenue ? round((margin / x.costedRevenue) * 100) : null,
      };
    };

    const products = [...byProduct.values()]
      .map((r) => ({
        productId: r.productId,
        name: r.name,
        unit: r.unit,
        qty: r.qty,
        ...summarize(r),
        uncostedQty: r.uncostedQty,
        estimatedQty: r.estimatedQty,
      }))
      .sort((a, b) => b.margin - a.margin);

    return res.status(200).json({
      route,
      from,
      to: req.query.to || null,
      invoiceCount: finalized.length,
      notFinalizedCount,
      totals: {
        ...summarize(totals),
        discount: round(totals.discount),
        uncostedRevenue: round(totals.uncostedRevenue),
        estimatedUnits: totals.estimatedUnits,
      },
      byRoute: Object.fromEntries(Object.entries(byRoute).map(([k, v]) => [k, summarize(v)])),
      products,
    });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
