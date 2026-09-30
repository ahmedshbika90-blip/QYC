import { useEffect, useState } from "react";
import { apiFetch } from "./apiFetch";
import { useLiveRefresh } from "./useLiveRefresh";
import { isSeen } from "./notificationSeen";

// Where each bucket's nav red dot lives, and where its "see everything"
// link goes.
export const BUCKET_HREF = {
  modification: "/requests",
  shipping: null, // agent → /documents (tab="shipping"); warehouse keeper → /warehouse/shipment-requests
};

export function useNotifications(token, role, uid) {
  const [raw, setRaw] = useState([]);
  const [tick, setTick] = useState(0); // bumped after markSeen so `visible` recomputes

  async function load() {
    if (!token || !role) return;
    try {
      const res = await apiFetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setRaw(data.items || []);
    } catch {
      // best-effort — next live refresh or reload tries again
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  useLiveRefresh(token, ["requests", "shipmentRequests", "inventory"], load);

  // A pending item is never locally marked seen, so it always stays
  // visible here (and keeps showing) until the server itself reports it
  // resolved. A resolved item drops out once markSeen has been called for
  // it (detail page, or dismissing the prompt).
  const visible = raw.filter((it) => it.needsAction || !isSeen(uid, it.id));

  function refreshSeen() {
    setTick((t) => t + 1);
  }

  const byBucket = (bucket) => visible.filter((it) => it.bucket === bucket);

  return {
    items: visible,
    modificationCount: byBucket("modification").length,
    shippingCount: byBucket("shipping").length,
    refreshSeen,
    _tick: tick,
  };
}
