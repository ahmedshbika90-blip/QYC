// Client list caching, built around a version stamp on the server
// (meta/versions.clients, bumped on every client add/edit). The full list
// is kept on the device; each check asks the server "is version N still
// current?" — that costs exactly 1 Firestore read. The full list is only
// re-downloaded when a client was actually added or edited since.
//
// Two layers:
//  - memory: skips even the 1-read version check on rapid page-to-page
//    navigation (within MEMORY_TTL)
//  - localStorage: survives page reloads / reopening the app, so a
//    normal day costs a handful of 1-read checks instead of re-reading
//    every client on every visit
//
// Cleared on logout (see clearLocalData) — client names and phone numbers
// shouldn't linger on a shared or handed-around device after sign-out.

const { notifyStale } = require("./apiCache");

const STORAGE_PREFIX = "clientsCache:";
// Other per-user copies saved on the device for offline use — all wiped on logout.
const OTHER_PREFIXES = ["productsCache:", "recentClients:", "profilePhoto:"];
const MEMORY_TTL = 60 * 1000;

let memory = null; // { uid, version, clients, checkedAt }

function storageKey(uid) {
  return `${STORAGE_PREFIX}${uid}`;
}

function readStorage(uid) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) || "null");
  } catch {
    return null;
  }
}

function writeStorage(uid, version, clients) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify({ version, clients }));
  } catch {
    // storage full or unavailable — memory layer still works
  }
}

async function getClients(apiFetch, token, uid) {
  if (memory && memory.uid === uid && Date.now() - memory.checkedAt < MEMORY_TTL) {
    return memory.clients;
  }

  const stored = readStorage(uid);
  const url = stored ? `/api/clients/list?v=${encodeURIComponent(stored.version)}` : "/api/clients/list";

  let res;
  try {
    res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    // Offline or unreachable: use the copy already saved on this device
    // (possibly slightly out of date) rather than failing the whole page.
    if (err.isNetworkError && stored) {
      notifyStale();
      return stored.clients;
    }
    throw err;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "حدث خطأ");

  const clients = data.unchanged ? stored.clients : data.clients;
  if (!data.unchanged) writeStorage(uid, data.version, clients);

  memory = { uid, version: data.version, clients, checkedAt: Date.now() };
  return clients;
}

// Call right after adding/editing a client in this browser, so the next
// read goes to the server immediately instead of waiting out the memory TTL.
function invalidateClients() {
  memory = null;
}

function clearLocalData() {
  memory = null;
  try {
    Object.keys(localStorage)
      .filter((k) => [STORAGE_PREFIX, ...OTHER_PREFIXES].some((p) => k.startsWith(p)))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

module.exports = { getClients, invalidateClients, clearLocalData };
