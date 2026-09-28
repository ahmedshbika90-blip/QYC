const { admin, adminDb } = require("./firebaseAdmin");

const VERSIONS_DOC = adminDb.collection("meta").doc("versions");

// Bumps the version stamp for a data set (e.g. "clients") — every browser
// holding a cached copy will see the new number on its next 1-read check
// and re-download. Must be called after EVERY write to that data set,
// otherwise cached copies silently go stale.
async function bumpVersion(key) {
  await VERSIONS_DOC.set({ [key]: admin.firestore.FieldValue.increment(1) }, { merge: true });
}

async function getVersion(key) {
  const snap = await VERSIONS_DOC.get();
  return String((snap.exists && snap.data()[key]) || 0);
}

module.exports = { bumpVersion, getVersion };
