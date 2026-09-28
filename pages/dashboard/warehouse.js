import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import InventoryDocCard from "../../components/InventoryDocCard";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";

// Deliberately no live stock numbers here — the warehouse keeper's view
// is scoped to the movements themselves (goods received, loading,
// offloading), not running balances. Balance visibility lives on
// /products and the supervisor's /inventory page instead.
export default function WarehouseDashboard() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [docs, setDocs] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchDocs() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch("/api/inventory/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDocs(data.docs);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-1 text-gray-800">المخزن</h1>
        <p className="text-sm text-gray-400 mb-6">
          سجل حركات الاستلام والتحميل والتفريغ. إنشاء حركات تحميل/تفريغ جديدة سيُضاف قريبًا.
        </p>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchDocs} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : docs.length === 0 ? (
          <p className="text-gray-400">لا توجد حركات بعد.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {docs.map((d) => (
              <InventoryDocCard key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
