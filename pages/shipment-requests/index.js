import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import ProductCartPicker from "../../components/ProductCartPicker";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { useRequestId } from "../../lib/useRequestId";
import { formatDateTime } from "../../lib/labels";
import BackButton from "../../components/BackButton";
import SuccessToast from "../../components/SuccessToast";
import Icon from "../../components/Icon";

const STATUS_LABELS = {
  pending_car1: "بانتظار موافقة مبيعات الجملة",
  pending_warehouse: "بانتظار تنفيذ أمين المخزن",
  rejected: "مرفوض",
  fulfilled: "تم التنفيذ",
};
const STATUS_TONE = {
  pending_car1: "bg-amber-50 text-amber-700",
  pending_warehouse: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
  fulfilled: "bg-green-50 text-green-700",
};

function RequestRow({ r }) {
  return (
    <div className="p-4">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{r.type === "loading" ? "أمر شحن" : "مرتجع بضاعة"}</p>
          <p className="text-sm text-muted truncate mt-0.5">
            {r.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
          </p>
          <p className="text-xs text-muted mt-1">{formatDateTime(r.requestedAt)}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${STATUS_TONE[r.status] || ""}`}>
          {STATUS_LABELS[r.status] || r.status}
        </span>
      </div>
    </div>
  );
}

export default function ShipmentRequests() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  const [tab, setTab] = useState("new");
  const [own, setOwn] = useState([]);
  const [toDecide, setToDecide] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(null); // id currently being approved/rejected

  const [products, setProducts] = useState([]);
  const [type, setType] = useState("loading");
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const requestIds = useRequestId();

  // What's available depends on the direction of the movement:
  // LOADING draws on the depot, OFFLOADING on what's still in this car.
  // Car stock is the live balance the system maintains (morning loading
  // minus the day's sales) — not recomputed here, so the two can never
  // drift apart silently.
  const myRoute = role === "agent_car1" ? "car1" : "car2";
  const sourceField = type === "loading" ? "depot" : myRoute;
  const availableOf = (p) => (p ? p.stock?.[sourceField] ?? 0 : 0);
  const sourceLabel = type === "loading" ? "المخزن" : "العربة";

  // For a return, the picker lists ONLY what's still on the van, so the
  // agent starts from reality instead of a blank product catalogue.
  const availableProducts = products.filter((p) => availableOf(p) > 0);

  // Switching direction invalidates the cart: the quantities were capped
  // against a different source.
  function changeType(next) {
    if (next === type) return;
    setType(next);
    setCart([]);
    setError("");
  }

  async function loadLists() {
    setFetching(true);
    setError("");
    try {
      const ownRes = await apiFetch("/api/shipment-requests/list?scope=own", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ownData = await ownRes.json();
      if (!ownRes.ok) throw new Error(ownData.error);
      setOwn(ownData.requests);

      if (role === "agent_car1") {
        const tdRes = await apiFetch("/api/shipment-requests/list?scope=todecide", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const tdData = await tdRes.json();
        if (!tdRes.ok) throw new Error(tdData.error);
        setToDecide(tdData.requests);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadLists();
    apiFetch("/api/products/list?all=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setProducts((d.products || []).filter((p) => p.active !== false)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useLiveRefresh(token, ["shipmentRequests"], () => {
    invalidate("/api/shipment-requests");
    loadLists();
  });

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
      const res = await apiFetch("/api/shipment-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          (() => {
            const payload = { type, items: cart.map((it) => ({ productId: it.productId, qty: it.qty })), note };
            return { ...payload, requestId: requestIds.idFor(payload) };
          })()
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      setCart([]);
      setNote("");
      setSuccess(
        role === "agent_car2"
          ? "تم إرسال الطلب — بانتظار موافقة مبيعات الجملة."
          : "تم إرسال الطلب — بانتظار تنفيذ أمين المخزن."
      );
      loadLists();
    } catch (err) {
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(id, action) {
    setActing(id);
    setError("");
    try {
      const res = await apiFetch(`/api/shipment-requests/${id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadLists();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(null);
    }
  }

  if (loading) return <PageLoading />;

  const tabs = [
    ["new", "طلب جديد"],
    ["own", "طلباتي"],
    ...(role === "agent_car1" ? [["todecide", `بانتظار موافقتي${toDecide.length ? ` (${toDecide.length})` : ""}`]] : []),
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <SuccessToast message={success} onDone={() => setSuccess("")} />
      <main className="max-w-3xl mx-auto px-4 pt-4 pb-8 sm:px-8">
        <BackButton href={role === "agent_car1" ? "/dashboard/car1" : "/dashboard/car2"} />
        <h1 className="font-display text-2xl font-bold mb-3 mt-1 text-ink">طلبات الشحن</h1>

        <div role="tablist" className="inline-flex gap-1 p-1 mb-4 rounded-xl bg-surface-2 overflow-x-auto no-scrollbar">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap h-10 px-4 rounded-lg text-sm ${
                tab === key ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
            <Icon name="alert" size={18} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {tab === "new" && (
          <form onSubmit={submit} className="bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["loading", "تحميل", "من المخزن إلى السيارة"],
                ["offloading", "تفريغ", "من السيارة إلى المخزن"],
              ].map(([value, label, sub]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => changeType(value)}
                  className={`rounded-xl py-2.5 border text-center ${
                    type === value ? "bg-accent text-on-accent border-accent" : "bg-white text-ink-soft border-line"
                  }`}
                >
                  <span className="block text-base font-medium">{label}</span>
                  <span className={`block text-xs ${type === value ? "opacity-80" : "text-muted"}`}>{sub}</span>
                </button>
              ))}
            </div>

            {type === "offloading" && (
              <p className="text-sm text-ink-soft bg-surface-2 rounded-xl px-3 py-2.5">
                المتبقي في العربة الآن — اختر ما تريد إرجاعه للمخزن.
              </p>
            )}

            <ProductCartPicker
              products={availableProducts}
              cart={cart}
              setCart={setCart}
              maxFor={availableOf}
              hint={(p) => `${sourceLabel}: ${availableOf(p)}`}
            />

            {availableProducts.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
                {type === "offloading" ? "لا توجد بضاعة متبقية في العربة." : "لا توجد كميات متاحة في المخزن."}
              </p>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ملاحظتك (اختياري)"
              className="w-full border rounded-lg px-3 py-2 text-base"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </button>
          </form>
        )}

        {tab === "own" &&
          (fetching ? (
            <SkeletonRows count={4} />
          ) : own.length === 0 ? (
            <p className="text-gray-400">لا توجد طلبات بعد.</p>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y">
              {own.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
            </div>
          ))}

        {tab === "todecide" &&
          (fetching ? (
            <SkeletonRows count={4} />
          ) : toDecide.length === 0 ? (
            <p className="text-gray-400">لا توجد طلبات بانتظار موافقتك.</p>
          ) : (
            <div className="space-y-2">
              {toDecide.map((r) => (
                <div key={r.id} className="bg-white rounded-lg shadow p-4">
                  <p className="font-medium text-gray-800">{r.type === "loading" ? "تحميل" : "تفريغ"} — مبيعات تجزئة</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {r.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
                  </p>
                  {r.note && <p className="text-xs text-gray-400 mt-1">ملاحظة: {r.note}</p>}
                  <p className="text-xs text-muted mt-1">{formatDateTime(r.requestedAt)}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => decide(r.id, "approve")}
                      disabled={acting === r.id}
                      className="flex-1 bg-accent text-on-accent rounded-lg h-11 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {acting === r.id && <Spinner className="w-4 h-4" />}
                      موافقة
                    </button>
                    <button
                      onClick={() => decide(r.id, "reject")}
                      disabled={acting === r.id}
                      className="text-sm text-red-600 bg-red-50 rounded-lg px-4 h-11 disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </main>
    </div>
  );
}
