import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./apiFetch";
import { useLivePoll } from "./useLivePoll";
import { subscribeVersions } from "./liveVersions";
import { invalidate } from "./apiCache";

const FALLBACK_POLL_MS = 20 * 1000;

// Which cached API responses go stale when an area's counter moves. Cleared
// before onChange runs, so a page's refetch can never be served the old copy
// from lib/apiCache.js (its 60s TTL would otherwise hide a live update).
const AREA_CACHE_PREFIXES = {
  orders_car1: ["/api/orders", "/api/reports"],
  orders_car2: ["/api/orders", "/api/reports"],
  requests: ["/api/requests"],
  inventory: ["/api/inventory"],
  clients: ["/api/clients"],
};

/**
 * Real-time updates: listens to the change counters in meta/versions
 * (lib/liveVersions.js) and fires `onChange` the moment one of this page's
 * areas moves — someone approved a request, confirmed a loading, placed an
 * invoice — so the page can invalidate its cache and refetch through the API.
 *
 * If the live listener is refused or can't run, falls back automatically to
 * the old behaviour: asking GET /api/versions every 20 seconds.
 *
 * `keys`: area names from lib/versions.js, e.g. ["orders_car1", "inventory"].
 * Same signature as before, so no page needs changing.
 */
export function useLiveRefresh(token, keys, onChange) {
  const seen = useRef({});
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [polling, setPolling] = useState(false);
  const keyStr = keys.join(",");
  const signedIn = !!token;

  function check(versions) {
    const changed = [];
    for (const k of keyStr.split(",")) {
      const v = versions[k] || 0;
      if (seen.current[k] !== undefined && seen.current[k] !== v) changed.push(k);
      seen.current[k] = v;
    }
    if (!changed.length) return;
    changed.forEach((k) => (AREA_CACHE_PREFIXES[k] || []).forEach(invalidate));
    changeRef.current();
  }

  // Live path
  useEffect(() => {
    if (!signedIn || !keyStr) return;
    return subscribeVersions((s) => {
      if (s.status === "failed") setPolling(true);
      else if (s.versions) check(s.versions);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, keyStr]);

  // Fallback path — only runs if the live listener failed
  useLivePoll(
    async () => {
      if (!token || !keyStr) return;
      try {
        const res = await apiFetch("/api/versions", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok) check(data.versions);
      } catch {
        // offline/unreachable — the next check retries
      }
    },
    FALLBACK_POLL_MS,
    [token, keyStr],
    polling
  );
}
