import { useEffect, useState } from "react";
import { apiFetch } from "./apiFetch";
import { useLiveRefresh } from "./useLiveRefresh";

// Where "requests" lives for each role — the nav link that gets the red
// dot, and where the full-screen prompt's button sends the person.
export const REQUESTS_HREF = {
  supervisor: "/requests",
  warehouse_keeper: "/warehouse/shipment-requests",
  agent_car1: "/requests",
  agent_car2: "/requests",
};

export function useActionCount(token, role) {
  const [count, setCount] = useState(0);

  async function load() {
    if (!token || !role || !REQUESTS_HREF[role]) return;
    try {
      const res = await apiFetch("/api/action-items", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setCount(data.count || 0);
    } catch {
      // best-effort — a failed check just means the dot doesn't update
      // this time; the next live refresh or reload tries again.
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  useLiveRefresh(token, ["requests", "shipmentRequests", "inventory"], load);

  return count;
}
