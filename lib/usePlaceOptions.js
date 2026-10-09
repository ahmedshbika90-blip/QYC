import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./apiFetch";
import { cachedGet, invalidate } from "./apiCache";
import { getClients, invalidateClients } from "./clientsStore";
import { useLiveRefresh } from "./useLiveRefresh";
import { vanTypeOfId } from "./vanNames";

// Routes (المسار) and locations (الموقع) to offer in the pickers, for one
// sales type: the ones on clients (device copy) + the ones added on their
// own (/api/places). `reload()` after saving something new, so the next
// form shows it at once — no page refresh.
export function usePlaceOptions(token, user, salesRoute) {
  const [clients, setClients] = useState([]);
  const [places, setPlaces] = useState({ routes: [], locations: [] });

  const load = useCallback(async () => {
    if (!token || !user) return;
    const [c, p] = await Promise.all([
      getClients(apiFetch, token, user.uid).catch(() => null),
      cachedGet(apiFetch, "/api/places", token).catch(() => null),
    ]);
    if (c) setClients(c);
    if (p) setPlaces({ routes: p.routes || [], locations: p.locations || [] });
  }, [token, user]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(token, ["clients", "places"], load);

  const reload = useCallback(async () => {
    invalidateClients();
    invalidate("/api/places");
    await load();
  }, [load]);

  const value = useMemo(() => {
    // salesRoute is the sales TYPE key (car1 wholesale / car2 retail); a
    // client's route is its van, which may be any van of that type.
    const typeKey = (van) => (vanTypeOfId(van) === "retail" ? "car2" : "car1");
    const mine = (x) => !salesRoute || x.salesRoute === salesRoute || (x.route && typeKey(x.route) === salesRoute);
    const routes = new Set();
    const locs = new Map(); // name -> Set(routes)
    const addLoc = (name, route) => {
      const n = (name || "").trim();
      if (!n) return;
      if (!locs.has(n)) locs.set(n, new Set());
      if (route) locs.get(n).add(route.trim());
    };
    clients.filter(mine).forEach((c) => {
      if (c.deliveryRoute) routes.add(c.deliveryRoute.trim());
      addLoc(c.location, c.deliveryRoute);
    });
    places.routes.filter(mine).forEach((r) => routes.add(r.name));
    places.locations.filter(mine).forEach((l) => addLoc(l.name, l.deliveryRoute));
    const sortAr = (a, b) => a.localeCompare(b, "ar");
    return {
      routes: [...routes].filter(Boolean).sort(sortAr),
      locations: [...locs.keys()].sort(sortAr),
      /** Locations already seen on this route — listed first in the picker. */
      locationsOn: (route) => [...locs.entries()].filter(([, rs]) => route && rs.has(route.trim())).map(([n]) => n),
      clients,
    };
  }, [clients, places, salesRoute]);

  return { ...value, reload };
}
