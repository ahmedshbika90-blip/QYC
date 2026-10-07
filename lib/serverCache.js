// Short in-memory cache on each server instance, for data that every
// screen asks for and that rarely changes (product catalog, English names).
//
// A cached copy is used only while BOTH hold:
//   - it is younger than `ttlMs` (60–120 s), and
//   - the change counters it depends on (meta/versions, lib/versions.js)
//     are still the same as when it was loaded.
// Checking the counters costs 1 read, instead of re-reading the whole
// collection. Any change anywhere bumps its counter, so the next request
// after a change always gets fresh data — the time limit is only a safety
// net for a change that forgot to bump.

const { getAllVersions } = require("./versions");

const store = new Map(); // name -> { sig, at, value }

async function cachedByVersions(name, keys, ttlMs, loader) {
  const versions = await getAllVersions();
  const sig = keys.map((k) => versions[k] || 0).join(".");
  const hit = store.get(name);
  if (hit && hit.sig === sig && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await loader();
  store.set(name, { sig, at: Date.now(), value });
  return value;
}

function clearServerCache() {
  store.clear();
}

module.exports = { cachedByVersions, clearServerCache };
