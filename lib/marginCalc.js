const { adminDb } = require("./firebaseAdmin");
const { netLines } = require("./invoiceDiscount");

const round = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Operating margin over a GIVEN set of invoices — whatever the caller
 * passes in, finalized or not. Same arithmetic as the supervisor's margin
 * page (pages/api/reports/margin.js): revenue is after each invoice's
 * discount (spread over its lines by netLines), cost is the unit cost
 * frozen on each line at sale time, with the product's current average
 * cost as a fallback for old lines that never stored one.
 *
 * Used for the agent's "today" figure (today's current invoices) and for
 * the sales report (exactly the invoices in that report). Because those
 * invoices aren't finalized yet, the result is a running figure: editing
 * or cancelling an invoice changes it.
 */
async function marginForOrders(orders) {
  const active = orders.filter((o) => o.status !== "cancelled");

  const needFallback = new Set();
  active.forEach((o) => (o.items || []).forEach((it) => it.unitCost == null && needFallback.add(it.productId)));
  const fallback = new Map();
  if (needFallback.size) {
    const snaps = await adminDb.getAll(...[...needFallback].map((pid) => adminDb.collection("products").doc(pid)));
    snaps.forEach((s) => {
      if (s.exists && typeof s.data().avgCost === "number") fallback.set(s.id, s.data().avgCost);
    });
  }

  let revenue = 0;
  let costedRevenue = 0;
  let cost = 0;
  let uncostedRevenue = 0;
  for (const o of active) {
    for (const it of netLines(o)) {
      const lineRevenue = it.netSubtotal;
      revenue += lineRevenue;
      const unitCost = it.unitCost != null ? it.unitCost : fallback.get(it.productId);
      if (unitCost == null) {
        uncostedRevenue += lineRevenue;
      } else {
        cost += unitCost * it.qty;
        costedRevenue += lineRevenue;
      }
    }
  }

  const margin = costedRevenue - cost;
  return {
    revenue: round(revenue),
    margin: round(margin),
    marginPct: costedRevenue ? round((margin / costedRevenue) * 100) : null,
    // Revenue from products with no cost on record at all — excluded from
    // the margin so it isn't overstated. Normally 0.
    uncostedRevenue: round(uncostedRevenue),
    invoiceCount: active.length,
  };
}

module.exports = { marginForOrders };
