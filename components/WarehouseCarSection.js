import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "./Nav";
import ProductCartPicker from "./ProductCartPicker";
import InventoryHistory from "./InventoryHistory";
import { PageLoading, Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { invalidate } from "../lib/apiCache";

const CAR_LABEL = { car1: "السيارة ١", car2: "السيارة ٢" };

// One car's section for the warehouse keeper: create a loading/offloading
// document for this car, and see this car's movement history. Stock only
// moves once the car's agent confirms.
export default function WarehouseCarSection({ route }) {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [products, setProducts] = useState([]);
  const [type, setType] = useState("loading");
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/products/list?all=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setProducts((d.products || []).filter((p) => p.active !== false)))
      .catch(() => setError("تعذر تحميل المنتجات"));
  }, [token]);

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
      const res = await apiFetch("/api/inventory/movement", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type,
          route,
          items: cart.map((it) => ({ productId: it.productId, qty: it.qty })),
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCart([]);
      setNote("");
      setSuccess("تم الإرسال — بانتظار تأكيد المندوب.");
      invalidate("/api/inventory");
      setReloadKey((k) => k + 1);
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
        <h1 className="text-xl font-semibold mb-4 text-gray-800">{CAR_LABEL[route]}</h1>

        <form onSubmit={submit} className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["loading", "تحميل", "من المخزن إلى السيارة"],
              ["offloading", "تفريغ", "من السيارة إلى المخزن"],
            ].map(([value, label, sub]) => (
              <button
                type="button"
                key={value}
                onClick={() => setType(value)}
                className={`rounded-lg py-2 border text-center ${
                  type === value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600"
                }`}
              >
                <span className="block text-base font-medium">{label}</span>
                <span className={`block text-xs ${type === value ? "text-gray-300" : "text-gray-400"}`}>{sub}</span>
              </button>
            ))}
          </div>

          <ProductCartPicker
            products={products}
            cart={cart}
            setCart={setCart}
            hint={type === "loading" ? (p) => `المخزن: ${p.stock?.depot ?? 0}` : undefined}
          />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="ملاحظتك (اختياري)"
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
            {submitting ? "جارٍ الإرسال..." : "إرسال للتأكيد"}
          </button>
        </form>

        <h2 className="font-medium text-gray-800 mb-3">حركات {CAR_LABEL[route]}</h2>
        <InventoryHistory token={token} fixedRoute={route} reloadKey={reloadKey} />
      </div>
    </div>
  );
}
