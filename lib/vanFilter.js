// One filter value for "which vans": a single van ("van-w2"), a whole sales
// category ("type:wholesale" / "type:retail"), or nothing (all vans).
// Vans are the unit; wholesale / retail are categories over them.

const { listVans } = require("./vans");

function bad(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

/** → null (every van) or the list of van ids the filter covers. */
async function resolveVanFilter(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v || v === "all") return null;
  const vans = await listVans();
  const m = /^type:(wholesale|retail)$/.exec(v);
  if (m) return vans.filter((x) => x.type === m[1]).map((x) => x.id);
  if (!vans.some((x) => x.id === v)) throw bad("العربة غير موجودة");
  return [v];
}

/** Narrows a Firestore query on `route` to those vans (one: ==, several: in). */
function whereVans(query, ids) {
  if (!ids) return query;
  if (ids.length === 0) return query.where("route", "==", "__none__");
  return ids.length === 1 ? query.where("route", "==", ids[0]) : query.where("route", "in", ids.slice(0, 30));
}

module.exports = { resolveVanFilter, whereVans };
