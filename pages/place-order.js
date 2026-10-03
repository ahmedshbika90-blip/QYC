import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import SuccessScreen from "../components/SuccessScreen";
import InvoiceTotals from "../components/InvoiceTotals";
import QtyStepper from "../components/QtyStepper";
import FreeSampleToggle from "../components/FreeSampleToggle";
import { PageLoading, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { invalidate } from "../lib/apiCache";
import { getClients } from "../lib/clientsStore";
import { newRequestId } from "../lib/requestId";
import { formatDate, formatNumber, formatQty } from "../lib/labels";

// Invoices that couldn't be sent (no connection) are queued on the device,
// per agent, and sent automatically when the connection returns. Each keeps
// its request ID, so resending can never create a duplicate even if an
// earlier attempt actually reached the server.
const QUEUE_PREFIX = "unsentInvoices:";
const PRODUCTS_PREFIX = "productsCache:";
const RETRY_INTERVAL_MS = 30 * 1000;

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export default function PlaceOrder() {
  const { user, role, token, loading, logout } = useAuth();

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState(""); // whole-invoice amount, SDG
  const [invoiceNotes, setInvoiceNotes] = useState(""); // written before submitting
  const [submitting, setSubmitting] = useState(false);
  const [queue, setQueue] = useState([]); // unsent invoices saved on this device
  const [productsStale, setProductsStale] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Client picker
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientBoxRef = useRef(null);

  // Product picker + cart. Each product has a different price per route,
  // so prices only resolve once a client (and therefore a route) is picked.
  const [productQuery, setProductQuery] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [cart, setCart] = useState([]); // [{ productId, name, price, unit, qty }]
  const productBoxRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const queueKey = user ? `${QUEUE_PREFIX}${user.uid}` : null;

  // Load this agent's unsent invoices, send them as soon as possible, and
  // keep retrying while any remain: on reconnect, on return to the app,
  // and every 30 seconds (the "online" event alone is unreliable — a
  // phone can report "online" while nothing actually gets through).
  useEffect(() => {
    if (!token || !queueKey) return;
    setQueue(readJSON(queueKey, []));
    flushQueue();
    const onBack = () => flushQueue();
    const onVisible = () => document.visibilityState === "visible" && flushQueue();
    const interval = setInterval(() => {
      if (readJSON(queueKey, []).some((q) => !q.rejected)) flushQueue();
    }, RETRY_INTERVAL_MS);
    window.addEventListener("online", onBack);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onBack);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queueKey]);

  const flushing = useRef(false);
  async function flushQueue() {
    if (!queueKey || flushing.current) return;
    const pending = readJSON(queueKey, []).filter((q) => !q.rejected);
    if (pending.length === 0) return;
    flushing.current = true;
    setRetrying(true);
    try {
      for (const item of pending) {
        try {
          await submitPayload({ clientId: item.clientId, items: item.items, requestId: item.requestId });
          updateQueue((list) => list.filter((q) => q.requestId !== item.requestId));
        } catch (err) {
          if (err.isNetworkError || err.isAuthError) break; // temporary — try again later
          // The server refused it (e.g. stock no longer enough). Resending
          // won't help, so keep it visible with the reason instead of
          // retrying forever or silently dropping it.
          updateQueue((list) =>
            list.map((q) => (q.requestId === item.requestId ? { ...q, rejected: err.message } : q))
          );
        }
      }
    } finally {
      flushing.current = false;
      setRetrying(false);
    }
  }

  function updateQueue(fn) {
    const next = fn(readJSON(queueKey, []));
    writeJSON(queueKey, next);
    setQueue(next);
  }

  function discardQueued(requestId) {
    if (!confirm("حذف هذه الفاتورة غير المرسلة؟ لن تُسجَّل.")) return;
    updateQueue((list) => list.filter((q) => q.requestId !== requestId));
  }

  // Close dropdowns when tapping/clicking outside them.
  useEffect(() => {
    function handleClickOutside(e) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target)) {
        setClientDropdownOpen(false);
      }
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

  async function fetchData() {
    setFetching(true);
    setError("");
    try {
      // Products stay uncached on purpose: they carry live stock levels,
      // which change with every invoice. Clients come from the version cache.
      const productsKey = `${PRODUCTS_PREFIX}${user.uid}`;
      const loadProducts = async () => {
        try {
          const res = await apiFetch("/api/products/list", { headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          writeJSON(productsKey, data.products);
          setProductsStale(false);
          return data.products;
        } catch (err) {
          // Offline: use the catalog saved on this device so the agent can
          // still prepare an invoice. Stock shown may be outdated — the
          // server re-checks real stock when the invoice is actually sent.
          const saved = readJSON(productsKey, null);
          if (err.isNetworkError && saved) {
            setProductsStale(true);
            return saved;
          }
          throw err;
        }
      };
      const [clientList, productList] = await Promise.all([
        getClients(apiFetch, token, user.uid),
        loadProducts(),
      ]);
      setClients(clientList.filter((c) => c.active !== false));
      setProducts(productList);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  const filteredClients = clients
    .filter((c) => {
      if (!clientQuery) return true;
      const needle = clientQuery.toLowerCase();
      return (
        c.id.includes(needle) ||
        c.name.toLowerCase().includes(needle) ||
        c.storeName.toLowerCase().includes(needle)
      );
    })
    .slice(0, 8);

  function pickClient(c) {
    setSelectedClient(c);
    setClientQuery("");
    setClientDropdownOpen(false);
    setCart([]); // prices depend on route, so start fresh if switching clients
  }

  function clearClient() {
    setSelectedClient(null);
    setClientQuery("");
    setCart([]);
  }

  const cartProductIds = new Set(cart.map((it) => it.productId));
  const filteredProducts = products
    .filter((p) => !cartProductIds.has(p.id))
    .filter((p) => {
      if (!productQuery) return true;
      return p.name.toLowerCase().includes(productQuery.toLowerCase());
    })
    .slice(0, 8);

  function priceFor(product) {
    return selectedClient ? product.prices?.[selectedClient.route] : undefined;
  }

  function stockFor(product) {
    return selectedClient ? product.stock?.[selectedClient.route] ?? 0 : 0;
  }

  function addProduct(p) {
    setCart((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        price: priceFor(p),
        unit: p.unit,
        qty: 1,
        freeSample: false,
        available: stockFor(p),
      },
    ]);
    setProductQuery("");
    setProductDropdownOpen(false);
  }

  function setCartQty(productId, qty) {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty } : it)));
  }

  function toggleFreeSample(productId) {
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, freeSample: !it.freeSample } : it)));
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((it) => it.productId !== productId));
  }

  // Line total mirrors the server (lib/orderCreation.js): price × qty.
  // Any discount is ONE amount off the whole invoice, entered below.
  function lineTotal(it) {
    if (it.freeSample) return 0; // free sample: no charge, stock still moves
    return (it.price || 0) * it.qty;
  }

  const subtotal = Math.round(cart.reduce((sum, it) => sum + lineTotal(it), 0) * 100) / 100;
  const discountValue = Number(invoiceDiscount) || 0;
  const total = Math.max(0, Math.round((subtotal - discountValue) * 100) / 100);

  // Background resends run from timers set up earlier, so they read the
  // CURRENT login token through a ref rather than the one captured then.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  async function submitPayload(payload) {
    const res = await apiFetch("/api/orders/create-staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify(payload),
    });
    // Expired/renewing login is temporary, not a rejection of the invoice.
    if (res.status === 401) throw Object.assign(new Error("انتهت صلاحية الجلسة مؤقتًا"), { isAuthError: true });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || "تعذر تسجيل الفاتورة"), { isRejection: true });
    invalidate("/api/orders/list");
    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!selectedClient) {
      setError("اختر عميلاً أولاً");
      return;
    }
    if (cart.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل");
      return;
    }
    if (discountValue > subtotal) {
      setError("الخصم أكبر من مجموع الفاتورة");
      return;
    }

    const payload = {
      clientId: selectedClient.id,
      items: cart.map((it) => ({ productId: it.productId, qty: it.qty, freeSample: Boolean(it.freeSample) })),
      discount: discountValue || 0,
      notes: invoiceNotes.trim(),
      requestId: newRequestId(), // one ID per invoice — resends reuse it
    };

    setSubmitting(true);
    try {
      const data = await submitPayload(payload);
      setResult(data);
      setCart([]);
      setInvoiceDiscount("");
      setInvoiceNotes("");
      clearClient();
    } catch (err) {
      if (err.isNetworkError || err.isAuthError) {
        // Connection failure (not a rejection): queue it on the device so
        // it isn't lost, and clear the form — the invoice is now safely
        // waiting to send, so the agent can move on without re-entering or
        // accidentally submitting it twice.
        const saved = writeJSON(queueKey, [
          ...readJSON(queueKey, []),
          {
            ...payload,
            clientLabel: `${selectedClient.name} (${selectedClient.storeName})`,
            total,
            savedAt: new Date().toISOString(),
          },
        ]);
        if (saved) {
          setQueue(readJSON(queueKey, []));
          setCart([]);
          setInvoiceDiscount("");
          setInvoiceNotes("");
          clearClient();
          setError("");
          setResult({ queued: true });
        } else {
          setError(err.message);
        }
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageLoading />;

  if (role === "supervisor") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-gray-500">
          المشرف يتابع الطلبات ولا يقوم بتقديمها مباشرة — استخدم حسابات المندوبين
          لتسجيل الطلبات الهاتفية.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-lg mx-auto p-4 sm:p-8">
        <div className="bg-white p-5 sm:p-8 rounded-lg shadow-md">
          {!result && <BackButton />}
          <h1 className="font-display text-2xl font-bold mb-6 text-ink">تسجيل فاتورة لعميل</h1>

          {queue.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-amber-800 text-sm font-medium">
                  فواتير لم تُرسل بعد ({queue.length}) — محفوظة على هذا الجهاز
                </p>
                <button
                  type="button"
                  onClick={flushQueue}
                  disabled={retrying}
                  className="text-sm bg-amber-600 text-white rounded-lg px-3 h-9 shrink-0 disabled:opacity-50 flex items-center gap-1"
                >
                  {retrying && <Spinner className="w-3 h-3" />}
                  {retrying ? "جارٍ الإرسال..." : "إرسال الآن"}
                </button>
              </div>
              <p className="text-xs text-amber-700 mb-2">
                تُرسل تلقائيًا عند عودة الاتصال. لن تتكرر أي فاتورة حتى لو أُعيد إرسالها.
              </p>
              <div className="divide-y divide-amber-200">
                {queue.map((q) => (
                  <div key={q.requestId} className="py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{q.clientLabel}</p>
                      <p className="text-xs text-gray-500">الإجمالي: {formatNumber(q.total || 0)}</p>
                      {q.rejected && (
                        <p className="text-xs text-red-600 mt-0.5">رُفضت: {q.rejected}</p>
                      )}
                    </div>
                    {q.rejected && (
                      <button
                        type="button"
                        onClick={() => discardQueued(q.requestId)}
                        className="text-xs text-red-600 bg-red-50 rounded px-2 h-8 shrink-0"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {productsStale && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
              بدون اتصال — تُعرض قائمة المنتجات المحفوظة، وقد لا تكون الكميات المتاحة محدّثة.
              تُراجع الكميات الفعلية عند إرسال الفاتورة.
            </p>
          )}

          {error && (
            <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
              <span>{error}</span>
              <button type="button" onClick={fetchData} className="underline shrink-0">
                إعادة المحاولة
              </button>
            </div>
          )}
          {/* Success (or saved-offline) replaces the form: the invoice number
              and the two next steps, nothing else. */}
          {result?.queued ? (
            <SuccessScreen
              tone="warn"
              title="حُفظت الفاتورة على الجهاز"
              hint="لا يوجد اتصال الآن — ستُرسل تلقائيًا عند عودته، ولن تتكرر."
              secondary={{ label: "الرئيسية", href: role === "agent_car1" ? "/dashboard/car1" : "/dashboard/car2" }}
              primary={{ label: "فاتورة جديدة", onClick: () => setResult(null) }}
            />
          ) : result ? (
            <SuccessScreen
              title="تم تسجيل الفاتورة"
              number={result.orderId}
              hint={`الإجمالي ${formatNumber(result.total)} — ${
                result.deliveryDate ? `التسليم ${formatDate(result.deliveryDate)}` : "حسب الطلب، تواصل مع العميل لتحديد الموعد"
              }`}
              secondary={{ label: "عرض الفاتورة", href: `/orders/${result.orderId}` }}
              primary={{ label: "فاتورة جديدة", onClick: () => setResult(null) }}
            />
          ) : fetching ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
              <Spinner className="w-4 h-4" /> جارٍ تحميل العملاء والمنتجات...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Client picker */}
              <div ref={clientBoxRef} className="relative">
                <label className="block text-sm text-gray-600 mb-1">العميل</label>

                {selectedClient ? (
                  <div className="flex items-center justify-between border rounded-lg px-3 py-3 bg-gray-50">
                    <span className="text-base text-gray-800 truncate">
                      #{selectedClient.id} — {selectedClient.name} ({selectedClient.storeName})
                    </span>
                    <button
                      type="button"
                      onClick={clearClient}
                      className="text-sm text-gray-500 min-h-[44px] px-2 shrink-0"
                    >
                      تغيير
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={clientQuery}
                      onChange={(e) => {
                        setClientQuery(e.target.value);
                        setClientDropdownOpen(true);
                      }}
                      onFocus={() => setClientDropdownOpen(true)}
                      placeholder="ابحث بالاسم أو المتجر أو الرقم..."
                      className="w-full border rounded-lg px-3 h-12 text-base"
                    />
                    {clientDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {filteredClients.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-gray-400">لا يوجد عملاء مطابقون</p>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => pickClient(c)}
                              className="w-full text-start px-3 py-3 text-base active:bg-gray-100 border-b last:border-0 min-h-[44px]"
                            >
                              #{c.id} — {c.name} <span className="text-gray-400">({c.storeName})</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Product picker — needs a client selected first, since price depends on route */}
              <div ref={productBoxRef} className="relative">
                <label className="block text-sm text-gray-600 mb-1">إضافة منتجات</label>
                {!selectedClient ? (
                  <p className="text-sm text-gray-400 border rounded-lg px-3 py-3 bg-gray-50">
                    اختر العميل أولاً لعرض الأسعار الصحيحة
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      value={productQuery}
                      onChange={(e) => {
                        setProductQuery(e.target.value);
                        setProductDropdownOpen(true);
                      }}
                      onFocus={() => setProductDropdownOpen(true)}
                      placeholder="ابحث عن منتج..."
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
                                {priceFor(p) != null ? formatNumber(priceFor(p)) : "—"} / {p.unit} · المتاح: {formatQty(stockFor(p))}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Cart */}
              {cart.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {cart.map((it) => (
                    <div key={it.productId} className="px-3 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base text-gray-800 truncate">{it.name}</p>
                          <p className="text-sm text-gray-400">
                            {it.price != null ? formatNumber(it.price) : "—"} / {it.unit} · المتاح: {formatQty(it.available)}
                          </p>
                        </div>
                        <QtyStepper
                          value={it.qty}
                          onChange={(v) => setCartQty(it.productId, v)}
                          min={0}
                          max={it.available}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <FreeSampleToggle checked={Boolean(it.freeSample)} onChange={() => toggleFreeSample(it.productId)} />
                        {it.freeSample && it.price != null && (
                          <span className="text-xs text-muted">القيمة {formatNumber(it.price * it.qty)} — لن تُحتسب على العميل</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <InvoiceTotals subtotal={subtotal} discount={invoiceDiscount} onDiscountChange={setInvoiceDiscount} />
              )}

              <div>
                <label htmlFor="invoice-notes" className="block text-sm text-gray-600 mb-1">
                  ملاحظة على الفاتورة (اختياري)
                </label>
                <textarea
                  id="invoice-notes"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="مثال: التسليم بعد العصر"
                  className="w-full border rounded-lg px-3 py-2 text-base"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Spinner className="w-4 h-4" />}
                {submitting ? "جارٍ تسجيل الفاتورة..." : "تسجيل الفاتورة"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
