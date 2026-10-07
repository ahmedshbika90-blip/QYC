// Turns the flat list of competitor price entries into what the executive
// reads: one group per product (SKU), and in it one row per company with
// the company's LATEST price and how it moved since that company's previous
// entry for the same SKU. Browser-safe, no data access.

const keyOf = (e) => e.skuKey || String(e.sku || "").toUpperCase().replace(/\s+/g, "");
const newer = (a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));

/**
 * @param entries newest first or any order
 * @returns [{ key, sku, item, rows: [{ company, price, date, prev, change, changePct, count, by }],
 *             min, max, latestDate }]  — groups newest-activity first,
 *             rows cheapest first.
 */
function groupBySku(entries) {
  const groups = new Map();
  for (const e of [...entries].sort(newer)) {
    const key = keyOf(e);
    if (!groups.has(key)) groups.set(key, { key, sku: e.sku, item: e.item, companies: new Map(), latestDate: e.date });
    const g = groups.get(key);
    const ck = e.company.trim();
    if (!g.companies.has(ck)) g.companies.set(ck, []);
    g.companies.get(ck).push(e); // newest first
  }
  return [...groups.values()].map((g) => {
    const rows = [...g.companies.entries()].map(([company, list]) => {
      const [last, prev] = list;
      const change = prev ? last.price - prev.price : null;
      return {
        company,
        price: last.price,
        date: last.date,
        by: last.createdByName || null,
        prev: prev ? { price: prev.price, date: prev.date } : null,
        change,
        changePct: prev && prev.price ? Math.round((change / prev.price) * 1000) / 10 : null,
        count: list.length,
      };
    });
    rows.sort((a, b) => a.price - b.price || a.company.localeCompare(b.company, "ar"));
    const prices = rows.map((r) => r.price);
    return { key: g.key, sku: g.sku, item: g.item, rows, min: Math.min(...prices), max: Math.max(...prices), latestDate: g.latestDate };
  });
}

/** Distinct values of a field, A→Z, for pickers and filters. */
function distinct(entries, field) {
  return [...new Set(entries.map((e) => String(e[field] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

module.exports = { groupBySku, distinct };
