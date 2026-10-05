import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatQty } from "../../lib/labels";

// View-only window onto the main depot's balances. No receiving, no
// loading/offloading, no editing anywhere on this page — the role exists
// purely so someone can check stock levels without touching them.
export default function DepotViewStock() {
  const { role, token, loading, logout } = useAuth(["depot_viewer", "manager", "warehouse_keeper"]);
  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/products/list?all=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d.products) throw new Error(d.error || "تعذر تحميل المنتجات");
        setProducts(d.products.filter((p) => p.active !== false));
      })
      .catch((err) => setError(err.message))
      .finally(() => setFetching(false));
  }, [token]);

  const visible = useMemo(
    () => products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <BackButton />
        <h1 className="text-xl font-semibold mb-1 text-gray-800">المخزن الرئيسي</h1>
        <p className="text-xs text-gray-400 mb-3">عرض فقط — بدون صلاحية تعديل.</p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن منتج..."
          className="w-full border rounded-lg px-3 h-12 text-base mb-3"
        />

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {fetching ? (
          <SkeletonRows count={6} />
        ) : visible.length === 0 ? (
          <p className="text-gray-400">لا توجد منتجات.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {visible.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-gray-800">{p.name}</p>
                  {p.lowStock && <p className="text-xs text-amber-600 mt-0.5">رصيد منخفض</p>}
                </div>
                <div className="text-end">
                  <p className={`font-medium ${(p.stock?.depot ?? 0) === 0 ? "text-red-500" : "text-gray-800"}`}>
                    {formatQty(p.stock?.depot ?? 0)} <span className="text-xs text-gray-400 font-normal">{p.unit}</span>
                  </p>
                  {p.stock?.damaged > 0 && (
                    <p className="text-xs text-gray-400">تالف: {formatQty(p.stock.damaged)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
