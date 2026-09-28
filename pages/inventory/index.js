import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import QtyStepper from "../../components/QtyStepper";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDateTime } from "../../lib/labels";

const TYPE_LABELS = {
  received: "استلام بضاعة",
  loading: "تحميل",
  offloading: "تفريغ",
};

export default function InventoryPage() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);

  const [products, setProducts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Goods-received cart
  const [cart, setCart] = useState([]); // [{ productId, name, unit, qty, costPrice }]
  const [productQuery, setProductQuery] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const productBoxRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

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

  const cartProductIds = new Set(cart.map((it) => it.productId));
  const filteredProducts = products
    .filter((p) => !cartProductIds.has(p.id))
    .filter((p) => !productQuery || p.name.toLowerCase().includes(productQuery.toLowerCase()))
    .slice(0, 8);

  function addProduct(p) {
    setCart((prev) => [...prev, { productId: p.id, name: p.name, unit: p.unit, qty: 1, costPrice: "" }]);
    setProductQuery("");
    setProductDropdownOpen(false);
  }

  function setCartQty(productId, qty) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((it) => it.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty } : it)));
  }

  function setCartCost(productId, costPrice) {
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, costPrice } : it)));
  }

  async function submitReceived(e) {
    e.preventDefault();
    setError("");
    if (cart.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/inventory/received", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cart.map((it) => ({
            productId: it.productId,
            qty: it.qty,
            costPrice: it.costPrice,
          })),
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCart([]);
      setNotes("");
      fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-1 text-gray-800">المخزون</h1>
        <p className="text-sm text-gray-400 mb-6">
          استلام البضاعة من المصنع يزيد رصيد المخزن مباشرة. حركات التحميل والتفريغ بين
          المخزن والسيارات تظهر هنا بعد تأكيدها من أمين المخزن والمندوب.
        </p>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        <form onSubmit={submitReceived} className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
          <h2 className="font-medium text-gray-800">استلام بضاعة جديدة</h2>

          <div ref={productBoxRef} className="relative">
            <input
              type="text"
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                setProductDropdownOpen(true);
              }}
              onFocus={() => setProductDropdownOpen(true)}
              placeholder="أضف منتجًا..."
              className="w-full border rounded-lg px-3 h-12 text-base"
            />
            {productDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">لا توجد منتجات مطابقة</p>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full text-start px-3 py-3 text-base active:bg-gray-100 border-b last:border-0 flex justify-between min-h-[44px]"
                    >
                      <span>{p.name}</span>
                      <span className="text-gray-400 text-sm">
                        المخزن: {p.stock?.depot ?? 0} {p.unit}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border rounded-lg divide-y">
              {cart.map((it) => (
                <div key={it.productId} className="flex items-center justify-between px-3 py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-gray-800 truncate">{it.name}</p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={it.costPrice}
                      onChange={(e) => setCartCost(it.productId, e.target.value)}
                      placeholder="تكلفة الوحدة (اختياري)"
                      className="mt-1 w-40 border rounded-lg px-2 h-9 text-sm"
                    />
                  </div>
                  <QtyStepper value={it.qty} onChange={(v) => setCartQty(it.productId, v)} min={0} />
                </div>
              ))}
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="ملاحظات (اختياري)"
            className="w-full border rounded-lg px-3 py-2 text-base"
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            {submitting ? "جارٍ الحفظ..." : "تسجيل الاستلام"}
          </button>
        </form>

        <h2 className="font-medium text-gray-800 mb-3">سجل حركات المخزون</h2>
        {fetching ? (
          <SkeletonRows count={4} />
        ) : docs.length === 0 ? (
          <p className="text-gray-400">لا توجد حركات بعد.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {docs.map((d) => (
              <div key={d.id} className="p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
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
                  <span
                    className={`text-xs px-2 py-1 rounded-lg shrink-0 ${
                      d.status === "confirmed"
                        ? "bg-green-50 text-green-700"
                        : d.status === "disputed"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {d.status === "confirmed" ? "مؤكدة" : d.status === "disputed" ? "متنازع عليها" : "قيد التأكيد"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
