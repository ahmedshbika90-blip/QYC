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

// Warehouse keeper's main page: shortcuts to the three working sections,
// everything still awaiting someone's action (agent confirmation or
// supervisor approval), then the full filterable movement history.
export default function WarehouseDashboard() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [pending, setPending] = useState([]);

  useEffect(() => {
    if (!token) return;
    cachedGet(apiFetch, "/api/inventory/list?status=pending", token)
      .then((d) => setPending(d.docs))
      .catch(() => {});
  }, [token]);

  useLiveRefresh(token, ["inventory"], () => {
    cachedGet(apiFetch, "/api/inventory/list?status=pending", token).then((d) => setPending(d.docs)).catch(() => {});
  });

  if (loading) return <PageLoading />;

  const inbox = pending.map((d) => ({
    key: d.id,
    href: `/inventory/${d.id}`,
    icon: d.type === "received" ? "warehouse" : d.type === "offloading" ? "box" : "truck",
    tone: "warn",
    title: `${TYPE_LABELS[d.type] || d.type}${d.route ? ` · ${d.route === "car1" ? "جملة" : "تجزئة"}` : ""}`,
    meta: `${previewNames(d.items)} · ${d.type === "received" ? "بانتظار اعتماد المشرف" : "بانتظار تأكيد المندوب"}`,
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
          title="بانتظار الطرف الآخر"
          items={inbox}
          emptyText="كل المستندات مؤكدة ومعتمدة"
        />

        <SectionTitle>كل الحركات</SectionTitle>
        <InventoryHistory token={token} excludePending />
      </main>
    </div>
  );
}
