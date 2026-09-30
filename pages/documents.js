import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import InventoryHistory from "../components/InventoryHistory";
import ShipmentRequestsPanel from "../components/ShipmentRequestsPanel";
import { PageLoading } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";

const HOME = { agent_car1: "/dashboard/car1", agent_car2: "/dashboard/car2" };

// Everything related to physical goods movement on this car: submitting
// a shipping order or a cargo return, seeing their status (car1 also
// approves/rejects car2's), and the archive of already-confirmed
// documents. "شحن" is the default tab since it's the one with something
// to actually act on; the archive is just history.
export default function Documents() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  const [tab, setTab] = useState("shipping");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    cachedGet(apiFetch, "/api/inventory/list?status=pending", token)
      .then((d) => setPendingCount(d.docs.length))
      .catch(() => {});
  }, [token]);

  useLiveRefresh(token, ["inventory"], () => {
    cachedGet(apiFetch, "/api/inventory/list?status=pending", token).then((d) => setPendingCount(d.docs.length)).catch(() => {});
  });

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">المستندات</h1>

        {pendingCount > 0 && (
          <Link
            href={HOME[role] || "/"}
            className="block bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-4"
          >
            لديك {pendingCount} بانتظار تأكيدك في الصفحة الرئيسية ←
          </Link>
        )}

        <div className="flex gap-1 mb-4 overflow-x-auto">
          {[
            ["shipping", "شحن"],
            ["archive", "الأرشيف"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap min-h-[40px] px-4 rounded-lg text-sm ${
                tab === key ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "shipping" ? (
          <ShipmentRequestsPanel role={role} token={token} />
        ) : (
          <InventoryHistory
            token={token}
            excludePending
            showRouteFilter={false}
            emptyText="لا توجد مستندات مؤكدة في هذه الفترة."
          />
        )}
      </div>
    </div>
  );
}
