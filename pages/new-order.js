import { useEffect, useState } from "react";
import QtyStepper from "../components/QtyStepper";
import { Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { formatDate } from "../lib/labels";

function cacheKey(route) {
  return `cachedProductCatalog_${route}`;
}

const DRAFT_KEY = "pendingOrderDraft";

// No login required — clients identify themselves with their 4-digit ID.
// Built touch-first and connection-resilient: this page is used by the
// general public in Sudan, often on slow or intermittent mobile data.
//
// Each product has a different price depending on which route (car1/car2)
// the client is on, so the catalog can't be shown until the client's
// route is known — the flow is: enter ID → look up route → show catalog
// priced for that route.
export default function NewOrder() {
  const [clientId, setClientId] = useState("");
  const [route, setRoute] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [draftPending, setDraftPending] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // If a previous submission attempt failed purely due to a connection
  // problem (not a real rejection), it was saved to localStorage instead
  // of just being lost — restore it here and try again automatically the
  // moment the connection comes back, since that's the whole point of a
  // draft on an unreliable network.
  useEffect(() => {
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      draft = null;
    }
    if (draft) {
      setDraftPending(true);
      const goOnline = () => retryDraft();
      window.addEventListener("online", goOnline);
      return () => window.removeEventListener("online", goOnline);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retryDraft() {
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      draft = null;
    }
    if (!draft) {
      setDraftPending(false);
      return;
    }
    setRetrying(true);
    try {
      await submitPayload(draft);
      localStorage.removeItem(DRAFT_KEY);
      setDraftPending(false);
    } catch {
      // still failing — leave the draft in place, banner stays up
    } finally {
      setRetrying(false);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    setLookupError("");
    setLookingUp(true);
    try {
      const res = await apiFetch(`/api/clients/lookup-route?clientId=${clientId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRoute(data.route);
      loadCatalog(data.route);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookingUp(false);
    }
  }

  async function loadCatalog(forRoute) {
    setLoadingProducts(true);
    setError("");
    try {
      const res = await apiFetch(`/api/products/list?route=${forRoute}`);
      const data = await res.json();
      const list = data.products || [];
      setProducts(list);
      setUsingCache(false);
      try {
        localStorage.setItem(cacheKey(forRoute), JSON.stringify(list));
      } catch {
        // storage full or unavailable — not critical, just skip caching
      }
    } catch (err) {
      try {
        const cached = localStorage.getItem(cacheKey(forRoute));
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

  function changeClient() {
    setRoute(null);
    setProducts([]);
    setQuantities({});
    setResult(null);
  }

  function setQty(productId, qty) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  const selectedItems = products
    .filter((p) => quantities[p.id] > 0)
    .map((p) => ({ productId: p.id, name: p.name, price: p.price, unit: p.unit, qty: quantities[p.id] }));

  const total = selectedItems.reduce((sum, it) => sum + it.price * it.qty, 0);

  async function submitPayload(payload) {
    const res = await apiFetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || "تعذر تقديم الطلب"), { isRejection: true });
    setResult(data);
    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (selectedItems.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل بكمية أكبر من صفر");
      return;
    }

    const payload = {
      clientId,
      items: selectedItems.map((it) => ({ productId: it.productId, qty: it.qty })),
    };

    setSubmitting(true);
    try {
      await submitPayload(payload);
      setQuantities({});
    } catch (err) {
      if (err.isNetworkError) {
        // Real connection failure, not a rejection from the server — save
        // the attempt so it isn't just lost; the banner + online-event
        // listener will retry it once the connection returns.
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
          setDraftPending(true);
          setError("تعذر الاتصال — تم حفظ طلبك وسيتم إرساله تلقائيًا عند عودة الإنترنت.");
        } catch {
          setError(err.message);
        }
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-lg mx-auto bg-white p-5 sm:p-8 rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-6 text-gray-800">تقديم طلب</h1>

        {draftPending && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-center justify-between gap-3">
            <p className="text-amber-700 text-sm">
              لديك طلب لم يُرسل بعد بسبب انقطاع الاتصال.
            </p>
            <button
              type="button"
              onClick={retryDraft}
              disabled={retrying}
              className="text-sm bg-amber-600 text-white rounded-lg px-3 h-9 shrink-0 disabled:opacity-50"
            >
              {retrying ? "جارٍ الإرسال..." : "إعادة الإرسال"}
            </button>
          </div>
        )}

        {!route ? (
          <form onSubmit={handleLookup} className="space-y-4">
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
            {lookupError && <p className="text-red-600 text-sm">{lookupError}</p>}
            <button
              type="submit"
              disabled={lookingUp}
              className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {lookingUp && <Spinner className="w-4 h-4" />}
              {lookingUp ? "جارٍ التحقق..." : "متابعة"}
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between border rounded-lg px-3 py-3 bg-gray-50 mb-4">
              <span className="text-base text-gray-800 tabular-ltr">#{clientId}</span>
              <button type="button" onClick={changeClient} className="text-sm text-gray-500 min-h-[44px] px-2">
                تغيير
              </button>
            </div>

            {error && (
              <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
                <span>{error}</span>
                <button type="button" onClick={() => loadCatalog(route)} className="underline shrink-0">
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
                  تم استلام طلبك! رقم الفاتورة: <span className="tabular-ltr">{result.orderId}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
