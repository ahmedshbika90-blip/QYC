import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import QtyStepper from "../components/QtyStepper";
import { PageLoading, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { formatDate } from "../lib/labels";

export default function PlaceOrder() {
  const { role, token, loading, logout } = useAuth();

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Client picker
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientBoxRef = useRef(null);

  // Product picker + cart
  const [productQuery, setProductQuery] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [cart, setCart] = useState([]); // [{ productId, name, price, unit, qty }]
  const productBoxRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      const [clientsRes, productsRes] = await Promise.all([
        apiFetch("/api/clients/list", { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch("/api/products/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const clientsData = await clientsRes.json();
      const productsData = await productsRes.json();
      if (!clientsRes.ok) throw new Error(clientsData.error);
      if (!productsRes.ok) throw new Error(productsData.error);
      setClients(clientsData.clients.filter((c) => c.active !== false));
      setProducts(productsData.products);
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
  }

  function clearClient() {
    setSelectedClient(null);
    setClientQuery("");
  }

  const cartProductIds = new Set(cart.map((it) => it.productId));
  const filteredProducts = products
    .filter((p) => !cartProductIds.has(p.id))
    .filter((p) => {
      if (!productQuery) return true;
      return p.name.toLowerCase().includes(productQuery.toLowerCase());
    })
    .slice(0, 8);

  function addProduct(p) {
    setCart((prev) => [...prev, { productId: p.id, name: p.name, price: p.price, unit: p.unit, qty: 1 }]);
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

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((it) => it.productId !== productId));
  }

  const total = cart.reduce((sum, it) => sum + it.price * it.qty, 0);

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

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/orders/create-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: selectedClient.id,
          items: cart.map((it) => ({ productId: it.productId, qty: it.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تقديم الطلب");
      setResult(data);
      setCart([]);
      clearClient();
    } catch (err) {
      setError(err.message);
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
          <h1 className="text-xl font-semibold mb-6 text-gray-800">تسجيل طلب لعميل</h1>

          {error && (
            <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
              <span>{error}</span>
              <button type="button" onClick={fetchData} className="underline shrink-0">
                إعادة المحاولة
              </button>
            </div>
          )}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-800 font-medium">
                تم تقديم الطلب! الرقم: <span className="tabular-ltr">{result.orderId}</span>
              </p>
              <p className="text-green-700 text-sm mt-1">الإجمالي: {result.total}</p>
              {result.deliveryDate ? (
                <p className="text-green-700 text-sm mt-1">
                  تاريخ التسليم: {formatDate(result.deliveryDate)}
                </p>
              ) : (
                <p className="text-green-700 text-sm mt-1">حسب الطلب — تواصل مع العميل لتحديد الموعد.</p>
              )}
            </div>
          )}

          {fetching ? (
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

              {/* Product picker */}
              <div ref={productBoxRef} className="relative">
                <label className="block text-sm text-gray-600 mb-1">إضافة منتجات</label>
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
                          <span className="text-gray-400">
                            {p.price} / {p.unit}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Cart */}
              {cart.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {cart.map((it) => (
                    <div key={it.productId} className="flex items-center justify-between px-3 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-base text-gray-800 truncate">{it.name}</p>
                        <p className="text-sm text-gray-400">
                          {it.price} / {it.unit}
                        </p>
                      </div>
                      <QtyStepper value={it.qty} onChange={(v) => setCartQty(it.productId, v)} min={0} />
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
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
          )}
        </div>
      </div>
    </div>
  );
}
