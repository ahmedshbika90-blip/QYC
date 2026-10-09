// Display names for vans (sales routes) on any screen, without each screen
// loading the vans list itself: lib/useVans.js fills this in, and the two
// original vans have their usual names before that.
const DEFAULT_NAMES = {
  car1: { name: "مبيعات جملة", short: "جملة", type: "wholesale" },
  car2: { name: "مبيعات تجزئة", short: "تجزئة", type: "retail" },
};
let names = { ...DEFAULT_NAMES };
const listeners = new Set();

function registerVans(vans) {
  const next = { ...DEFAULT_NAMES };
  for (const v of vans || []) {
    const isOriginal = v.id === "car1" || v.id === "car2";
    next[v.id] = { name: isOriginal ? DEFAULT_NAMES[v.id].name : v.label, short: isOriginal ? DEFAULT_NAMES[v.id].short : v.label, type: v.type, active: v.active !== false, label: v.label };
  }
  names = next;
  listeners.forEach((l) => l(names));
}

/** "مبيعات جملة" / "مبيعات تجزئة" for the original vans, the van's name otherwise. */
const vanName = (id) => (names[id] && names[id].name) || id || "";
const vanShort = (id) => (names[id] && names[id].short) || id || "";
const vanTypeOfId = (id) => (names[id] && names[id].type) || (id === "car2" ? "retail" : "wholesale");
/** [[id, name], …] for filter chips — every known van. */
const vanOptions = (short = false) => Object.keys(names).map((id) => [id, short ? vanShort(id) : vanName(id)]);
const allVanIds = () => Object.keys(names);
/**
 * Filter chips for "which vans": the two sales categories as a whole, then
 * every van by name. Values: "type:wholesale" | "type:retail" | van id.
 */
const vanFilterOptions = () => [["type:wholesale", "كل الجملة"], ["type:retail", "كل التجزئة"], ...vanOptions()];
/** Does an invoice / client / document on `route` match the filter value? */
function matchesVanFilter(filter, route) {
  if (!filter || filter === "all") return true;
  const m = /^type:(wholesale|retail)$/.exec(filter);
  if (m) return vanTypeOfId(route) === m[1];
  return route === filter;
}
/** Display name of a filter value (subtitle, report header). */
const vanFilterName = (filter) => (filter === "type:wholesale" ? "كل الجملة" : filter === "type:retail" ? "كل التجزئة" : vanName(filter));
function onVanNames(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { registerVans, vanName, vanShort, vanTypeOfId, vanOptions, vanFilterOptions, matchesVanFilter, vanFilterName, allVanIds, onVanNames };
