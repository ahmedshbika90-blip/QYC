import { useEffect, useRef } from "react";

// Calls `fn` immediately, then every intervalMs, and again the moment the
// tab becomes visible or focused — a backgrounded tab pauses timers, so
// that return moment is exactly when a missed update needs to be caught.
// `enabled` (default true) lets a caller keep the hook mounted but idle.
export function useLivePoll(fn, intervalMs, deps, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    fnRef.current();
    const id = setInterval(() => fnRef.current(), intervalMs);
    const onVisible = () => document.visibilityState === "visible" && fnRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
}
