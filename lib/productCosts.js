// Current average cost per product, cached per server instance and dropped
// whenever stock or a product changes (lib/serverCache.js). Used to price
// old invoice lines that have no saved cost — the same rule as the
// manager's margin figures.
const { adminDb } = require("./firebaseAdmin");
const { cachedByVersions } = require("./serverCache");

const KEYS = ["products", "orders_car1", "orders_car2", "inventory", "transfers", "shipmentRequests"];

async function avgCosts() {
  return cachedByVersions("productCosts", KEYS, 90 * 1000, async () => {
    const snap = await adminDb.collection("products").get();
    const out = {};
    snap.docs.forEach((d) => {
      const c = d.data().avgCost;
      if (typeof c === "number") out[d.id] = c;
    });
    return out;
  });
}

module.exports = { avgCosts };
