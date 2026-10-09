import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./apiFetch";
import { cachedGet } from "./apiCache";
import { useLiveRefresh } from "./useLiveRefresh";
import { registerVans, onVanNames } from "./vanNames";

// Vans for screens (lib/vans.js on the server). Until loaded, the two
// original vans, so nothing flickers on the usual setup.
export const DEFAULT_VANS = [
  { id: "car1", label: "عربة الجملة", type: "wholesale", active: true },
  { id: "car2", label: "عربة التجزئة", type: "retail", active: true },
];
const PRICE_KEY = { wholesale: "car1", retail: "car2" };
export const vanTypeOf = (vans, id) => (vans.find((v) => v.id === id) || {}).type || (id === "car2" ? "retail" : "wholesale");
/** Which product price applies to a van: prices.car1 (wholesale) or prices.car2 (retail). */
export const priceKeyOf = (vans, id) => PRICE_KEY[vanTypeOf(vans, id)];
export const vanLabel = (vans, id) => (vans.find((v) => v.id === id) || {}).label || id;

export function useVans(token) {
  const [vans, setVans] = useState(DEFAULT_VANS);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await cachedGet(apiFetch, "/api/vans", token);
      if (d?.vans?.length) {
        setVans(d.vans);
        registerVans(d.vans); // names for every screen (lib/vanNames.js)
      }
    } catch {
      // keep the defaults
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(token, ["vans", "profiles"], load);
  return vans;
}

/** Re-render when van names arrive (for components that only show names). */
export function useVanNames() {
  const [, bump] = useState(0);
  useEffect(() => onVanNames(() => bump((n) => n + 1)), []);
}
