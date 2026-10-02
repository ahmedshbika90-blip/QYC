import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { TYPE_LABELS, previewNames } from "../../components/InventoryDocCard";
import QuickActions from "../../components/QuickActions";
import { TodayHeader, ActionInbox, SectionTitle } from "../../components/Today";
import InventoryHistory from "../../components/InventoryHistory";
import { PageLoading } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDateTime } from "../../lib/labels";

// Warehouse keeper's main page: shortcuts to the three working sections,
// a live inbox of requests + documents that need HIS attention (new
// shipment requests from agents come in here — previously the keeper had
// to remember to open the shipment-requests page), and the full
// filterable movement history.
export default function WarehouseDashboard() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [pending, setPending] = useState([]);
  const [incomingReqs, setIncomingReqs] = useState([]);

  async function refresh() {
    if (!token) return;
    try {
      const [pendingData, reqData] = await Promise.all([
        cachedGet(apiFetch, "/api/inventory/list?status=pending", token),
        cachedGet(apiFetch, "/api/shipment-requests/list?status=pending_warehouse", token),
      ]);
      setPending(pendingData.docs);
      setIncomingReqs(reqData.requests || []);
    } catch {}
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useLiveRefresh(token, ["inventory", "shipmentRequests"], refresh);

  if (loading) return <PageLoading />;

  // Actionable requests FIRST — these are new work that came in from the
  // agents and the keeper needs to fulfill. Then the "still waiting on
  // the other side" bucket, which is really just a tracker.
  const actionable = incomingReqs.map((r) => ({
    key: `req-${r.id}`,
    // Straight to that car's own section, where the request is waiting.
    href: `/warehouse/${r.route}`,
    icon: r.type === "loading" ? "truck" : "box",
    tone: "warn",
    title: `${r.type === "loading" ? "أمر شحن جديد" : "مرتجع بضاعة جديد"} · ${r.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة"}`,
    meta: `${previewNames(r.items)} · ${formatDateTime(r.requestedAt)}`,
    cta: "نفّذ",
  }));

  const awaitingOthers = pending.map((d) => ({
    key: d.id,
    href: `/inventory/${d.id}`,
    icon: d.type === "received" ? "warehouse" : d.type === "offloading" ? "box" : "truck",
    tone: "accent",
    title: `${TYPE_LABELS[d.type] || d.type}${d.route ? ` · ${d.route === "car1" ? "جملة" : "تجزئة"}` : ""}`,
    meta: `${previewNames(d.items)} · ${d.type === "received" || d.type === "damage" ? "بانتظار اعتماد المشرف" : "بانتظار تأكيد المندوب"}`,
  }));

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <TodayHeader title="المخزن" subtitle="المركز" />

        <QuickActions
          actions={[
            { href: "/warehouse/shipment-requests", label: "طلبات الشحن", icon: "truck" },
            { href: "/warehouse/inventory", label: "المخزون", icon: "box" },
            { href: "/warehouse/car1", label: "مبيعات جملة", icon: "warehouse" },
            { href: "/warehouse/car2", label: "مبيعات تجزئة", icon: "warehouse" },
          ]}
        />

        <ActionInbox
          title="بانتظار تنفيذك"
          items={actionable}
          emptyText="لا طلبات جديدة — كل شيء منفَّذ"
        />

        <ActionInbox
          title="بانتظار الطرف الآخر"
          items={awaitingOthers}
          emptyText="كل المستندات مؤكدة ومعتمدة"
        />

        <SectionTitle>كل الحركات</SectionTitle>
        <InventoryHistory token={token} excludePending />
      </main>
    </div>
  );
}
