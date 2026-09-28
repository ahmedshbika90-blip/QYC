// Module-level cache — persists across page navigations within the same
// browser tab/session (Next.js client-side routing keeps the JS module
// alive), resets on a hard refresh. This is NOT shared between users or
// devices; it's purely "don't re-fetch what this browser already has
// fresh," not a substitute for real-time sync between different people
// looking at the same data simultaneously.
const cache = new Map(); // key -> { data, timestamp }
const DEFAULT_TTL = 60 * 1000; // 60 seconds

function getCached(key, ttl = DEFAULT_TTL) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) return null;
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Removes every cached entry whose key starts with `prefix`. Call this
 * right after any mutation (creating/cancelling/editing something) so the
 * next read is always guaranteed fresh, rather than relying on the TTL
 * alone — a person should never see stale data immediately after they
 * themselves just changed it.
 */
function invalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Cached GET: returns the cached response if fresh, otherwise fetches via
 * apiFetch (so it still gets the timeout/retry behavior), caches the
 * result, and returns it. Throws on a non-OK response, matching how the
 * rest of the app's fetch call sites already handle errors.
 */
async function cachedGet(apiFetch, url, token, { ttl } = {}) {
  const cached = getCached(url, ttl);
  if (cached) return cached;

  try {
    const res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "حدث خطأ");
    setCached(url, data);
    return data;
  } catch (err) {
    // Connection failed: if this page was already loaded earlier in this
    // session, show that last copy instead of an error — and announce it,
    // so the StaleNotice can tell the user it may be out of date.
    const stale = cache.get(url);
    if (err.isNetworkError && stale) {
      notifyStale();
      return stale.data;
    }
    throw err;
  }
}

// Tells the UI "what you're seeing is a saved copy, not live data".
function notifyStale() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("stale-data"));
}

module.exports = { getCached, setCached, invalidate, cachedGet, notifyStale };
