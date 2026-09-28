import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import QtyStepper from "../../components/QtyStepper";
import InventoryDocCard from "../../components/InventoryDocCard";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";

// Deliberately no live stock numbers here — the warehouse keeper's view
// is scoped to the movements themselves (goods received, loading,
// offloading), not running balances. Balance visibility lives on
// /products and the supervisor's /inventory page instead.
export default function WarehouseDashboard() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [products, setProducts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  // --- Goods received (depot <- supplier) ---
  const [submittingReceived, setSubmittingReceived] = useState(false);
  const [receivedCart, setReceivedCart] = useState([]); // [{ productId, name, unit, qty }]
  const [receivedQuery, setReceivedQuery] = useState("");
  const [receivedDropdownOpen, setReceivedDropdownOpen] = useState(false);
  const [receivedNote, setReceivedNote] = useState("");
  const receivedBoxRef = useRef(null);

  // --- Loading / offloading (depot <-> car) ---
  const [submittingMovement, setSubmittingMovement] = useState(false);
  const [movementType, setMovementType] = useState("loading");
  const [movementRoute, setMovementRoute] = useState("car1");
  const [movementCart, setMovementCart] = useState([]);
  const [movementQuery, setMovementQuery] = useState("");
  const [movementDropdownOpen, setMovementDropdownOpen] = useState(false);
  const [movementNote, setMovementNote] = useState("");
  const movementBoxRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (receivedBoxRef.current && !receivedBoxRef.current.contains(e.target)) {
        setReceivedDropdownOpen(false);
      }
      if (movementBoxRef.current && !movementBoxRef.current.contains(e.target)) {
        setMovementDropdownOpen(false);
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

  // --- Goods received handlers ---
  const receivedCartIds = new Set(receivedCart.map((it) => it.productId));
  const filteredReceivedProducts = products
    .filter((p) => !receivedCartIds.has(p.id))
    .filter((p) => !receivedQuery || p.name.toLowerCase().includes(receivedQuery.toLowerCase()))
    .slice(0, 8);

  function addReceivedProduct(p) {
    setReceivedCart((prev) => [...prev, { productId: p.id, name: p.name, unit: p.unit, qty: 1 }]);
    setReceivedQuery("");
    setReceivedDropdownOpen(false);
  }
  function setReceivedQty(productId, qty) {
    if (qty <= 0) {
      setReceivedCart((prev) => prev.filter((it) => it.productId !== productId));
      return;
    }
    setReceivedCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty } : it)));
  }

  async function submitReceived(e) {
    e.preventDefault();
    setError("");
    if (receivedCart.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل");
      return;
    }
    setSubmittingReceived(true);
    try {
      const res = await apiFetch("/api/inventory/received", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: receivedCart.map((it) => ({ productId: it.productId, qty: it.qty })),
          note: receivedNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReceivedCart([]);
      setReceivedNote("");
      fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingReceived(false);
    }
  }

  // --- Loading/offloading handlers ---
  const movementCartIds = new Set(movementCart.map((it) => it.productId));
  const filteredMovementProducts = products
    .filter((p) => !movementCartIds.has(p.id))
    .filter((p) => !movementQuery || p.name.toLowerCase().includes(movementQuery.toLowerCase()))
    .slice(0, 8);

  function addMovementProduct(p) {
    setMovementCart((prev) => [...prev, { productId: p.id, name: p.name, unit: p.unit, qty: 1 }]);
    setMovementQuery("");
    setMovementDropdownOpen(false);
  }
  function setMovementQty(productId, qty) {
    if (qty <= 0) {
      setMovementCart((prev) => prev.filter((it) => it.productId !== productId));
      return;
    }
    setMovementCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty } : it)));
  }

  async function submitMovement(e) {
    e.preventDefault();
    setError("");
    if (movementCart.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل");
      return;
    }
    setSubmittingMovement(true);
    try {
      const res = await apiFetch("/api/inventory/movement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: movementType,
          route: movementRoute,
          items: movementCart.map((it) => ({ productId: it.productId, qty: it.qty })),
          note: movementNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMovementCart([]);
      setMovementNote("");
      fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingMovement(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-6 text-gray-800">المخزن</h1>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {/* Loading / offloading */}
        <form onSubmit={submitMovement} className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
          <h2 className="font-medium text-gray-800">تحميل / تفريغ سيارة</h2>
          <p className="text-xs text-gray-400 -mt-2">
            {movementType === "loading" ? "من المخزن إلى السيارة" : "من السيارة إلى المخزن"} — بانتظار
            تأكيد المندوب قبل أن ينتقل الرصيد.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="border rounded-lg px-3 h-12 text-base"
            >
              <option value="loading">تحميل</option>
              <option value="offloading">تفريغ</option>
            </select>
            <select
              value={movementRoute}
              onChange={(e) => setMovementRoute(e.target.value)}
              className="border rounded-lg px-3 h-12 text-base"
            >
              <option value="car1">السيارة ١</option>
              <option value="car2">السيارة ٢</option>
            </select>
          </div>

          <div ref={movementBoxRef} className="relative">
            <input
              type="text"
              value={movementQuery}
              onChange={(e) => {
                setMovementQuery(e.target.value);
                setMovementDropdownOpen(true);
              }}
              onFocus={() => setMovementDropdownOpen(true)}
              placeholder="أضف منتجًا..."
              className="w-full border rounded-lg px-3 h-12 text-base"
            />
            {movementDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {filteredMovementProducts.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">لا توجد منتجات مطابقة</p>
                ) : (
                  filteredMovementProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => addMovementProduct(p)}
                      className="w-full text-start px-3 py-3 text-base active:bg-gray-100 border-b last:border-0 min-h-[44px]"
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {movementCart.length > 0 && (
            <div className="border rounded-lg divide-y">
              {movementCart.map((it) => (
                <div key={it.productId} className="flex items-center justify-between px-3 py-3 gap-3">
                  <p className="text-base text-gray-800 truncate">{it.name}</p>
                  <QtyStepper value={it.qty} onChange={(v) => setMovementQty(it.productId, v)} min={0} />
                </div>
              ))}
            </div>
          )}

          <textarea
            value={movementNote}
            onChange={(e) => setMovementNote(e.target.value)}
            rows={2}
            placeholder="ملاحظتك (اختياري)"
            className="w-full border rounded-lg px-3 py-2 text-base"
          />

          <button
            type="submit"
            disabled={submittingMovement}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submittingMovement && <Spinner className="w-4 h-4" />}
            {submittingMovement ? "جارٍ الحفظ..." : "إرسال للتأكيد"}
          </button>
        </form>

        {/* Goods received */}
        <form onSubmit={submitReceived} className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
          <h2 className="font-medium text-gray-800">تسجيل استلام بضاعة</h2>
          <p className="text-xs text-gray-400 -mt-2">بانتظار اعتماد المشرف قبل أن يُضاف إلى رصيد المخزن.</p>

          <div ref={receivedBoxRef} className="relative">
            <input
              type="text"
              value={receivedQuery}
              onChange={(e) => {
                setReceivedQuery(e.target.value);
                setReceivedDropdownOpen(true);
              }}
              onFocus={() => setReceivedDropdownOpen(true)}
              placeholder="أضف منتجًا..."
              className="w-full border rounded-lg px-3 h-12 text-base"
            />
            {receivedDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {filteredReceivedProducts.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">لا توجد منتجات مطابقة</p>
                ) : (
                  filteredReceivedProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => addReceivedProduct(p)}
                      className="w-full text-start px-3 py-3 text-base active:bg-gray-100 border-b last:border-0 min-h-[44px]"
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {receivedCart.length > 0 && (
            <div className="border rounded-lg divide-y">
              {receivedCart.map((it) => (
                <div key={it.productId} className="flex items-center justify-between px-3 py-3 gap-3">
                  <p className="text-base text-gray-800 truncate">{it.name}</p>
                  <QtyStepper value={it.qty} onChange={(v) => setReceivedQty(it.productId, v)} min={0} />
                </div>
              ))}
            </div>
          )}

          <textarea
            value={receivedNote}
            onChange={(e) => setReceivedNote(e.target.value)}
            rows={2}
            placeholder="ملاحظتك (اختياري) — يراها المشرف"
            className="w-full border rounded-lg px-3 py-2 text-base"
          />

          <button
            type="submit"
            disabled={submittingReceived}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submittingReceived && <Spinner className="w-4 h-4" />}
            {submittingReceived ? "جارٍ الحفظ..." : "تسجيل الاستلام"}
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
              <InventoryDocCard key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
