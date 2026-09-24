import { useEffect, useState } from "react";
import QtyStepper from "../components/QtyStepper";
import { Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { formatDate } from "../lib/labels";

const CACHE_KEY = "cachedProductCatalog";

// No login required — clients identify themselves with their 4-digit ID.
// Built touch-first and connection-resilient: this page is used by the
// general public in Sudan, often on slow or intermittent mobile data, so
// the catalog falls back to a cached copy if the live fetch fails.
export default function NewOrder() {
  const [clientId, setClientId] = useState("");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [usingCache, setUsingCache] = useState(false);
  const [quantities, setQuantities] = useState({}); // productId -> qty
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCatalog();
  }, []);

  async function loadCatalog() {
    setLoadingProducts(true);
    try {
      const res = await apiFetch("/api/products/list");
      const data = await res.json();
      const list = data.products || [];
      setProducts(list);
      setUsingCache(false);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(list));
      } catch {
        // storage full or unavailable — not critical, just skip caching
      }
    } catch (err) {
      // Live fetch failed (likely a connectivity issue) — fall back to
      // whatever catalog was last successfully loaded on this device.
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setProducts(JSON.parse(cached));
          setUsingCache(true);
        } else {
          setError("تعذر تحميل قائمة المنتجات. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
        }
      } catch {
        setError("تعذر تحميل قائمة المنتجات. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
      }
    } finally {
      setLoadingProducts(false);
    }
  }

  function setQty(productId, qty) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  const selectedItems = products
    .filter((p) => quantities[p.id] > 0)
    .map((p) => ({ productId: p.id, name: p.name, price: p.price, unit: p.unit, qty: quantities[p.id] }));

  const total = selectedItems.reduce((sum, it) => sum + it.price * it.qty, 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (selectedItems.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل بكمية أكبر من صفر");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          items: selectedItems.map((it) => ({ productId: it.productId, qty: it.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تقديم الطلب");
      setResult(data);
      setQuantities({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-lg mx-auto bg-white p-5 sm:p-8 rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-6 text-gray-800">تقديم طلب</h1>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button type="button" onClick={loadCatalog} className="underline shrink-0">
              إعادة المحاولة
            </button>
          </div>
        )}
        {usingCache && !error && (
          <p className="text-amber-600 text-xs mb-4 bg-amber-50 rounded-lg px-3 py-2">
            يتم عرض نسخة محفوظة من القائمة بسبب ضعف الاتصال — الأسعار قد لا تكون محدّثة.
          </p>
        )}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800 font-medium">
              تم تقديم الطلب! الرقم: <span className="tabular-ltr">{result.orderId}</span>
            </p>
            <p className="text-green-700 text-sm mt-1">الإجمالي: {result.total}</p>
            {result.deliveryDate ? (
              <p className="text-green-700 text-sm mt-1">
                تاريخ التسليم المتوقع: {formatDate(result.deliveryDate)}
              </p>
            ) : (
              <p className="text-green-700 text-sm mt-1">
                سيتواصل معك المندوب قريبًا لتحديد موعد التسليم.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-600 mb-1">رقم العميل الخاص بك</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border rounded-lg px-3 h-12 text-base font-mono tabular-ltr text-start"
              dir="ltr"
              placeholder="1000"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">المنتجات</label>
            {loadingProducts ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <Spinner className="w-4 h-4" /> جارٍ تحميل القائمة...
              </div>
            ) : products.length === 0 ? (
              <p className="text-gray-400 text-sm">لا توجد منتجات متاحة حاليًا.</p>
            ) : (
              <div className="border rounded-lg divide-y">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-base text-gray-800 truncate">{p.name}</p>
                      <p className="text-sm text-gray-400">
                        {p.price} / {p.unit}
                      </p>
                    </div>
                    <QtyStepper value={quantities[p.id] || 0} onChange={(v) => setQty(p.id, v)} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="text-end text-base text-gray-600">
              الإجمالي: <span className="font-semibold text-gray-900">{total.toFixed(2)}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            {submitting ? "جارٍ تقديم الطلب..." : "تقديم الطلب"}
          </button>
        </form>
      </div>
    </div>
  );
}
