import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import ProductCartPicker from "../components/ProductCartPicker";
import SuccessToast from "../components/SuccessToast";
import Icon from "../components/Icon";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet, invalidate } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { newRequestId } from "../lib/requestId";
import { formatDateTime, formatQty } from "../lib/labels";

export const TRANSFER_STATUS = {
  pending: ["بانتظار أمين المخزن", "bg-amber-100 text-amber-700"],
  released: ["تم الإخراج", "bg-green-100 text-green-800"],
  cancelled: ["ملغي", "bg-surface-2 text-muted"],
};

// Supervisor: transfer goods OUT of the main depot to another center.
// Quantities only — no price, no cost, no destination. The warehouse
// keeper releases it; stock leaves the depot at that moment.
export default function Transfers() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState("");
  const [fetching, setFetching] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [acting, setActing] = useState(null);

  async function load() {
    try {
      const [p, t] = await Promise.all([
        cachedGet(apiFetch, "/api/products/list", token),
        cachedGet(apiFetch, "/api/transfers/list", token),
      ]);
      setProducts(p.products || []);
      setTransfers(t.transfers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useLiveRefresh(token, ["transfers", "inventory"], () => {
    invalidate("/api/transfers/list");
    invalidate("/api/products/list");
    load();
  });

  const depotOf = (p) => (p ? p.stock?.depot ?? 0 : 0);

  async function submit(e) {
    e.preventDefault();
    if (!cart.length) return;
    setSending(true);
    setError("");
    try {
      const res = await apiFetch("/api/transfers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: cart.map((it) => ({ productId: it.productId, qty: it.qty })),
          note,
          requestId: newRequestId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCart([]);
      setNote("");
      setSuccess("تم إنشاء التحويل — بانتظار أمين المخزن");
      invalidate("/api/transfers/list");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function cancel(id) {
    if (!window.confirm("إلغاء هذا التحويل؟ لن يتحرك أي مخزون.")) return;
    setActing(id);
    setError("");
    try {
      const res = await apiFetch(`/api/transfers/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/transfers/list");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(null);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <SuccessToast message={success} onDone={() => setSuccess("")} />
      <main className="max-w-3xl mx-auto px-4 pt-4 pb-8 sm:px-8">
        <BackButton href="/dashboard/supervisor" />
        <h1 className="font-display text-2xl font-bold mt-1 text-ink">التحويلات</h1>
        <p className="text-sm text-muted mb-4">إخراج بضاعة من المخزن الرئيسي إلى مركز آخر — كميات فقط.</p>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="bg-white rounded-2xl shadow p-4 space-y-4 mb-6">
          <h2 className="text-base font-bold text-ink">تحويل جديد</h2>
          <ProductCartPicker
            products={products.filter((p) => depotOf(p) > 0)}
            cart={cart}
            setCart={setCart}
            maxFor={depotOf}
            hint={(p) => `المخزن: ${formatQty(depotOf(p))}`}
          />
          <label className="block">
            <span className="block text-sm font-medium text-ink-soft mb-1.5">ملاحظة (اختياري)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="w-full border border-line rounded-xl px-3 h-11 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!cart.length || sending}
            className="w-full bg-accent text-on-accent rounded-xl h-12 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {sending && <Spinner className="w-4 h-4" />}
            إنشاء التحويل
          </button>
        </form>

        <h2 className="text-base font-bold text-ink mb-3">كل التحويلات</h2>
        {fetching && transfers.length === 0 ? (
          <SkeletonRows count={3} />
        ) : transfers.length === 0 ? (
          <p className="text-muted text-sm bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد تحويلات بعد.</p>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t) => {
              const [label, tone] = TRANSFER_STATUS[t.status] || [t.status, ""];
              return (
                <li key={t.id} className="bg-white rounded-2xl shadow p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {t.items.map((it) => `${it.name} ×${formatQty(it.qty)}`).join("، ")}
                      </p>
                      {t.note && <p className="text-xs text-muted mt-1">ملاحظة: {t.note}</p>}
                      <p className="text-xs text-muted mt-1">
                        أُنشئ {formatDateTime(t.createdAt)}
                        {t.releasedAt && ` · أُخرج ${formatDateTime(t.releasedAt)}`}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${tone}`}>{label}</span>
                  </div>
                  {t.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancel(t.id)}
                      disabled={acting === t.id}
                      className="mt-3 text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-4 h-10 disabled:opacity-50"
                    >
                      إلغاء التحويل
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
