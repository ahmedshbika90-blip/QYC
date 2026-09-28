const { admin, adminDb } = require("./firebaseAdmin");

const VERSIONS_DOC = adminDb.collection("meta").doc("versions");

// Change counters, one per area: "clients", "orders_car1", "orders_car2",
// "requests", "inventory". Bumped after every change in that area. Open
// screens check this ONE document every 20 seconds (1 read) and re-download
// a page's data only when its area's counter moved — so changes made on
// another device show up within seconds, without constant full reloads.
async function bumpVersion(key) {
  await VERSIONS_DOC.set({ [key]: admin.firestore.FieldValue.increment(1) }, { merge: true });
}

// Best-effort: a failed bump only delays other screens noticing the change
// until the next one — it must never fail the action that already succeeded.
async function bumpVersions(keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  const inc = admin.firestore.FieldValue.increment(1);
  try {
    await VERSIONS_DOC.set(Object.fromEntries(unique.map((k) => [k, inc])), { merge: true });
  } catch {
    // ignore
  }
}

async function getVersion(key) {
  const snap = await VERSIONS_DOC.get();
  return String((snap.exists && snap.data()[key]) || 0);
}

async function getAllVersions() {
  const snap = await VERSIONS_DOC.get();
  return snap.exists ? snap.data() : {};
}

const ordersKey = (route) => (route ? `orders_${route}` : null);

module.exports = { bumpVersion, bumpVersions, getVersion, getAllVersions, ordersKey };
