import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import InventoryHistory from "../components/InventoryHistory";
import { PageLoading } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet } from "../lib/apiCache";

const HOME = { agent_car1: "/dashboard/car1", agent_car2: "/dashboard/car2" };

// Agent's archive of loading/offloading documents they've already acted
// on (confirmed, disputed, or cancelled by the supervisor). Anything still
// awaiting their confirmation stays on the main dashboard — once they
// confirm it, it leaves the dashboard and lives here.
export default function Documents() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    cachedGet(apiFetch, "/api/inventory/list?status=pending", token)
      .then((d) => setPendingCount(d.docs.length))
      .catch(() => {});
  }, [token]);

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

        <InventoryHistory
          token={token}
          excludePending
          showRouteFilter={false}
          emptyText="لا توجد مستندات مؤكدة في هذه الفترة."
        />
      </div>
    </div>
  );
}
