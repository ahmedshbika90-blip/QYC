import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import InventoryDocCard from "../../components/InventoryDocCard";
import InventoryHistory from "../../components/InventoryHistory";
import { PageLoading } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";

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

  if (loading) return <PageLoading />;

  const sections = [
    ["/warehouse/inventory", "المخزون"],
    ["/warehouse/car1", "السيارة ١"],
    ["/warehouse/car2", "السيارة ٢"],
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">المخزن</h1>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {sections.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-center bg-gray-900 text-white rounded-lg h-14 text-base font-medium active:bg-gray-700"
            >
              {label}
            </Link>
          ))}
        </div>

        {pending.length > 0 && (
          <div className="mb-5">
            <p className="text-sm font-medium text-amber-700 mb-2">بانتظار التأكيد أو الاعتماد ({pending.length})</p>
            <div className="bg-white rounded-lg shadow divide-y border border-amber-200">
              {pending.map((d) => (
                <InventoryDocCard key={d.id} doc={d} />
              ))}
            </div>
          </div>
        )}

        <h2 className="font-medium text-gray-800 mb-3">كل الحركات</h2>
        <InventoryHistory token={token} excludePending />
      </div>
    </div>
  );
}
