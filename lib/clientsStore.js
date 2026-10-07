// Client list caching, built around a version stamp on the server
// (meta/versions.clients, bumped on every client add/edit). The full list
// is kept on the device; each check asks the server "is version N still
// current?" — that costs exactly 1 Firestore read. When something did
// change, only the clients written since this device's copy are
// downloaded (delta sync on `syncAt`), not the whole list again.
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

function writeStorage(uid, version, clients, syncAt) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify({ version, clients, syncAt }));
  } catch {
    // storage full or unavailable — memory layer still works
  }
}

const byNewest = (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "");

/** The stored list with a delta applied: changed clients replaced or added, moved-away ones dropped. */
function applyDelta(list, changed, removed) {
  const map = new Map(list.map((c) => [c.id, c]));
  (removed || []).forEach((id) => map.delete(id));
  (changed || []).forEach((c) => map.set(c.id, c));
  return [...map.values()].sort(byNewest);
}

async function getClients(apiFetch, token, uid) {
  if (memory && memory.uid === uid && Date.now() - memory.checkedAt < MEMORY_TTL) {
    return memory.clients;
  }

  // With a saved copy: "same version?" (1 read) and, if not, only what
  // changed since that copy (one read per changed client). Without one —
  // or a copy saved before delta sync existed — the full list once.
  const stored = readStorage(uid);
  const p = new URLSearchParams();
  if (stored) {
    p.set("v", stored.version);
    if (stored.syncAt) p.set("since", stored.syncAt);
  }
  const url = `/api/clients/list${p.toString() ? `?${p}` : ""}`;

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

  let clients;
  if (data.unchanged) clients = stored.clients;
  else if (data.delta) clients = applyDelta(stored.clients, data.clients, data.removed);
  else clients = data.clients;
  if (!data.unchanged) writeStorage(uid, data.version, clients, data.syncAt || null);

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

module.exports = { getClients, invalidateClients, clearLocalData, applyDelta };
