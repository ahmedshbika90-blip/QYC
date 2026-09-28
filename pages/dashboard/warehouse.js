import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDateTime } from "../../lib/labels";

const TYPE_LABELS = {
  received: "استلام بضاعة",
  loading: "تحميل",
  offloading: "تفريغ",
};

export default function WarehouseDashboard() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [products, setProducts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchAll() {
    setFetching(true);
    setError("");
    try {
      const [productsRes, docsRes] = await Promise.all([
        apiFetch("/api/products/list?all=1", { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch("/api/inventory/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const productsData = await productsRes.json();
      const docsData = await docsRes.json();
      if (!productsRes.ok) throw new Error(productsData.error);
      if (!docsRes.ok) throw new Error(docsData.error);
      setProducts(productsData.products);
      setDocs(docsData.docs);
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
          عرض أرصدة المخزون الحالية وسجل الحركات. تحميل وتفريغ السيارات سيُضاف قريبًا.
        </p>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : (
          <>
            <div className="bg-white rounded-lg shadow divide-y mb-6">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">لكل {p.unit}</p>
                  </div>
                  <p className="text-sm text-gray-600">
                    المخزن: <span className="font-medium">{p.stock?.depot ?? 0}</span>
                    {"  ·  "}
                    السيارة ١: <span className="font-medium">{p.stock?.car1 ?? 0}</span>
                    {"  ·  "}
                    السيارة ٢: <span className="font-medium">{p.stock?.car2 ?? 0}</span>
                  </p>
                </div>
              ))}
            </div>

            <h2 className="font-medium text-gray-800 mb-3">سجل حركات المخزون</h2>
            {docs.length === 0 ? (
              <p className="text-gray-400">لا توجد حركات بعد.</p>
            ) : (
              <div className="bg-white rounded-lg shadow divide-y">
                {docs.map((d) => (
                  <div key={d.id} className="p-4">
                    <p className="font-medium text-gray-800">
                      {TYPE_LABELS[d.type] || d.type}
                      {d.route && (
                        <span className="text-xs font-normal text-gray-400 ms-2">
                          {d.route === "car1" ? "السيارة ١" : "السيارة ٢"}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {d.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(d.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
