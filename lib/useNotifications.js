import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./apiFetch";
import { useLiveRefresh } from "./useLiveRefresh";
import { isSeen } from "./notificationSeen";

// Where each bucket's nav red dot lives, and where its "see everything"
// link goes.
export const BUCKET_HREF = {
  modification: "/requests",
  shipping: null, // agent → /documents (tab="shipping"); warehouse keeper → /warehouse/shipment-requests
};

const MAX_TOASTS = 3;

const NOTIFIED_ROLES = ["manager", "agent_car1", "agent_car2", "warehouse_keeper"];

export function useNotifications(token, role, uid) {
  const [raw, setRaw] = useState([]);
  const [tick, setTick] = useState(0); // bumped after markSeen so `visible` recomputes
  const [toasts, setToasts] = useState([]);
  const [loaded, setLoaded] = useState(false); // first fetch done — the app-open prompt waits for it
  // "id -> needsAction:state" as of the last fetch. null until the first
  // fetch completes — the initial full list must never itself become a
  // burst of toasts, only what shows up or changes AFTER that.
  const prevSignatureRef = useRef(null);
  const timersRef = useRef(new Map());

  function dismissToast(toastId) {
    setToasts((prev) => prev.filter((t) => t._toastId !== toastId));
    const timer = timersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(toastId);
    }
  }

  async function load() {
    // Only these roles ever receive notifications — skip the polling for the
    // rest (admin, accountant, executive, depot viewer).
    if (!token || !NOTIFIED_ROLES.includes(role)) return;
    try {
      const res = await apiFetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) return;
      const items = data.items || [];

      const nextSignature = new Map(items.map((it) => [it.id, `${it.needsAction}:${it.state}`]));
      if (prevSignatureRef.current) {
        const prevSignature = prevSignatureRef.current;
        // Brand new items, or an existing one whose state just changed
        // (approved/rejected/fulfilled/confirmed while the person is
        // right here in the app) — either way, something just arrived.
        const arrived = items.filter((it) => prevSignature.get(it.id) !== nextSignature.get(it.id));
        if (arrived.length) {
          setToasts((prev) => {
            const combined = [...prev, ...arrived.map((it) => ({ ...it, _toastId: `${it.id}:${Date.now()}` }))];
            return combined.slice(-MAX_TOASTS);
          });
        }
      }
      prevSignatureRef.current = nextSignature;
      setRaw(items);
      setLoaded(true);
    } catch {
      // best-effort — next live refresh or reload tries again
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  useLiveRefresh(token, ["requests", "shipmentRequests", "inventory"], load);

  // No auto-dismiss: a toast stays until the person closes it (X, swipe)
  // or opens it — see components/NotificationToast.js. Timeouts used to
  // remove toasts before they could be read (WCAG 2.2.1).
  useEffect(() => {
    return () => timersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

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
    toasts,
    dismissToast,
    loaded,
    _tick: tick,
  };
}
