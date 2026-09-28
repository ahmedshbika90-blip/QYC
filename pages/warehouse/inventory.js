import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import ProductCartPicker from "../../components/ProductCartPicker";
import InventoryHistory from "../../components/InventoryHistory";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";

// Warehouse keeper's depot section: current depot balances (depot only —
// no car stock, no prices), logging goods received from the supplier
// (pending supervisor approval), and the history of those receipts.
export default function WarehouseInventory() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState("stock");

  useEffect(() => {
    if (!token) return;
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadProducts() {
    setFetching(true);
    try {
      const res = await apiFetch("/api/products/list?all=1", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProducts(data.products.filter((p) => p.active !== false));
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  const visibleProducts = useMemo(
    () => products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (cart.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/inventory/received", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: cart.map((it) => ({ productId: it.productId, qty: it.qty })), note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCart([]);
      setNote("");
      setSuccess("تم التسجيل — بانتظار اعتماد المشرف.");
      invalidate("/api/inventory");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageLoading />;

  const tabs = [
    ["stock", "رصيد المخزن"],
    ["receive", "استلام بضاعة"],
    ["history", "سجل الاستلام"],
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">المخزون</h1>

        <div className="flex gap-1 mb-4 overflow-x-auto">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap min-h-[40px] px-3 rounded-lg text-sm ${
                tab === key ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "stock" && (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="w-full border rounded-lg px-3 h-12 text-base mb-3"
            />
            {fetching ? (
              <SkeletonRows count={5} />
            ) : visibleProducts.length === 0 ? (
              <p className="text-gray-400">لا توجد منتجات.</p>
            ) : (
              <div className="bg-white rounded-lg shadow divide-y">
                {visibleProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4">
                    <p className="text-gray-800">{p.name}</p>
                    <p className={`font-medium ${(p.stock?.depot ?? 0) === 0 ? "text-red-500" : "text-gray-800"}`}>
                      {p.stock?.depot ?? 0} <span className="text-xs text-gray-400 font-normal">{p.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "receive" && (
          <form onSubmit={submit} className="bg-white rounded-lg shadow p-4 space-y-4">
            <p className="text-xs text-gray-400">يُضاف إلى رصيد المخزن بعد اعتماد المشرف.</p>
            <ProductCartPicker products={products} cart={cart} setCart={setCart} />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ملاحظتك (اختياري) — يراها المشرف"
              className="w-full border rounded-lg px-3 py-2 text-base"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            {success && <p className="text-green-700 text-sm">{success}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              {submitting ? "جارٍ الحفظ..." : "تسجيل الاستلام"}
            </button>
          </form>
        )}

        {tab === "history" && (
          <InventoryHistory token={token} fixedType="received" showRouteFilter={false} reloadKey={reloadKey} />
        )}
      </div>
    </div>
  );
}
