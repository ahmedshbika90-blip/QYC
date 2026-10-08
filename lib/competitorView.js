// Turns the flat list of competitor price entries into what the executive
// reads: one group per product (item + weight), and in it one row per
// company with the company's LATEST price, how it moved since that
// company's previous entry, and its price history for a sparkline.
// Browser-safe, no data access.

const UNIT_LABELS = { g: "جم", kg: "كجم", ml: "مل", l: "لتر" };
const fmtNum = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 3 });
/** "400 جم", or "" for entries saved before the weight field. */
const weightText = (e) => (e.weight ? `${fmtNum(e.weight)} ${UNIT_LABELS[e.weightUnit] || ""}`.trim() : "");

const keyOf = (e) => e.itemKey || (e.skuKey ? `sku:${e.skuKey}` : `sku:${String(e.sku || "").toUpperCase().replace(/\s+/g, "")}`);
const newer = (a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));

/**
 * @returns [{ key, item, weight, sku, rows, min, max, latestDate, companies }]
 *   rows: [{ company, price, date, route, by, prev, change, changePct, count, history }]
 *   groups newest activity first; rows cheapest first. history = oldest→newest prices.
 */
function groupByItem(entries) {
  const groups = new Map();
  for (const e of [...entries].sort(newer)) {
    const key = keyOf(e);
    if (!groups.has(key)) groups.set(key, { key, item: e.item, weight: weightText(e), sku: e.itemKey ? null : e.sku || null, companies: new Map(), latestDate: e.date });
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
        route: last.deliveryRoute || null,
        by: last.createdByName || null,
        prev: prev ? { price: prev.price, date: prev.date } : null,
        change,
        changePct: prev && prev.price ? Math.round((change / prev.price) * 1000) / 10 : null,
        count: list.length,
        history: list.slice(0, 12).map((x) => x.price).reverse(),
      };
    });
    rows.sort((a, b) => a.price - b.price || a.company.localeCompare(b.company, "ar"));
    const prices = rows.map((r) => r.price);
    const { companies, ...rest } = g;
    return { ...rest, rows, companies: rows.length, min: Math.min(...prices), max: Math.max(...prices) };
  });
}
// Old name, kept for anything still importing it.
const groupBySku = groupByItem;

/** Biggest price moves (by %), newest first among equals — for the "what changed" strip. */
function topMoves(groups, n = 6) {
  return groups
    .flatMap((g) => g.rows.filter((r) => r.changePct).map((r) => ({ ...r, item: g.item, weight: g.weight, key: g.key })))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.date.localeCompare(a.date))
    .slice(0, n);
}

/** Distinct values of a field, A→Z, for pickers and filters. */
function distinct(entries, field) {
  return [...new Set(entries.map((e) => String(e[field] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

module.exports = { groupByItem, groupBySku, topMoves, distinct, weightText, UNIT_LABELS };
