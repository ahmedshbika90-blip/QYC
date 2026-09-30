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
          <p className="font-medium text-gray-800">{r.type === "loading" ? "تحميل" : "تفريغ"}</p>
          <p className="text-sm text-gray-500 truncate mt-0.5">
            {r.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
          </p>
          <p className="text-xs text-gray-400 mt-1">{formatDateTime(r.requestedAt)}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${STATUS_TONE[r.status] || ""}`}>
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
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">طلبات الشحن</h1>

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

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {tab === "new" && (
          <form onSubmit={submit} className="bg-white rounded-lg shadow p-4 space-y-4">
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

            <ProductCartPicker products={products} cart={cart} setCart={setCart} />

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ملاحظتك (اختياري)"
              className="w-full border rounded-lg px-3 py-2 text-base"
            />

            {success && <p className="text-green-700 text-sm">{success}</p>}

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
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(r.requestedAt)}</p>
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
      </div>
    </div>
  );
}
