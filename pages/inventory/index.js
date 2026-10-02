import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import InventoryDocCard from "../../components/InventoryDocCard";
import Link from "next/link";
import Icon from "../../components/Icon";
import InventoryHistory from "../../components/InventoryHistory";
import { PageLoading } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";

// Supervisor oversight: everything awaiting action on top (goods received
// needing approval, loading/offloading awaiting an agent), then the full
// filterable, date-bounded history. Tap a pending receipt to approve it.
export default function InventoryPage() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
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

  // Received / damage documents awaiting approval live in الطلبات — this
  // page shows them only once decided (history below). Just a pointer here.
  const awaitingApproval = pending.filter((d) => d.type === "received" || d.type === "damage");
  const awaitingAgents = pending.filter((d) => d.type === "loading" || d.type === "offloading");

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <BackButton />
        <h1 className="text-xl font-semibold mb-4 text-gray-800">المخزون</h1>

        {awaitingApproval.length > 0 && (
          <Link
            href="/requests"
            className="flex items-center justify-between gap-3 bg-amber-50 text-amber-700 rounded-xl px-4 py-3 mb-5 text-sm font-semibold"
          >
            <span>
              {awaitingApproval.length} {awaitingApproval.length === 1 ? "مستند" : "مستندات"} (استلام / تالف) بانتظار اعتمادك في الطلبات
            </span>
            <Icon name="chevronLeft" size={18} />
          </Link>
        )}

        {awaitingAgents.length > 0 && (
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-600 mb-2">بانتظار تأكيد المندوب ({awaitingAgents.length})</p>
            <div className="bg-white rounded-lg shadow divide-y">
              {awaitingAgents.map((d) => (
                <InventoryDocCard key={d.id} doc={d} />
              ))}
            </div>
          </div>
        )}

        <h2 className="font-medium text-gray-800 mb-3">سجل الحركات</h2>
        <InventoryHistory token={token} excludePending />
      </div>
    </div>
  );
}
