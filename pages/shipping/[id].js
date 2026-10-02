import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useRequestId } from "../../lib/useRequestId";
import { formatDateTime } from "../../lib/labels";
import { markSeen } from "../../lib/notificationSeen";

const TYPE_LABEL = { loading: "أمر شحن", offloading: "مرتجع بضاعة" };
const ROUTE_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };
const STATUS_LABEL = {
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

export default function ShippingDetail() {
  const { role, token, user, loading, logout } = useAuth([
    "supervisor",
    "warehouse_keeper",
    "agent_car1",
    "agent_car2",
  ]);
  const router = useRouter();
  const { id } = router.query;

  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [qtyOverrides, setQtyOverrides] = useState({});
  const [note, setNote] = useState("");
  const requestIds = useRequestId();

  async function fetchDoc() {
    if (!token || !id) return;
    try {
      const res = await apiFetch(`/api/shipment-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setR(data);
      setQtyOverrides(Object.fromEntries(data.items.map((it) => [it.productId, String(it.qty)])));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    fetchDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  // Opening this page IS acknowledging a resolved notification about it —
  // no separate "mark as read" step needed. A still-pending request isn't
  // marked (it keeps showing until it's actually resolved).
  useEffect(() => {
    if (!r || !user) return;
    if (r.requestedBy === user.uid && ["rejected", "fulfilled"].includes(r.status)) {
      markSeen(user.uid, r.id);
    }
  }, [r, user]);

  async function decide(action) {
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/shipment-requests/${id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/shipment-requests");
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  async function fulfill() {
    setActing(true);
    setError("");
    try {
      const items = r.items.map((it) => ({ productId: it.productId, qty: Number(qtyOverrides[it.productId]) }));
      const body = { items, note };
      const res = await apiFetch(`/api/shipment-requests/${id}/fulfill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, requestId: requestIds.idFor({ ...body, sourceId: id }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      invalidate("/api/shipment-requests");
      invalidate("/api/inventory");
      fetchDoc();
    } catch (err) {
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <PageLoading />;

  if (!r) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-red-600 text-sm">{error || "جارٍ التحميل..."}</p>
      </div>
    );
  }

  const canDecide = role === "agent_car1" && r.route === "car2" && r.status === "pending_car1";
  const canFulfill = role === "warehouse_keeper" && r.status === "pending_warehouse";

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <BackButton />
              <h1 className="text-xl font-semibold text-gray-800">{TYPE_LABEL[r.type]}</h1>
              <p className="text-sm text-gray-500 mt-1">من: {ROUTE_LABEL[r.route]}</p>
              <p className="text-xs text-gray-400 mt-1">طُلب {formatDateTime(r.requestedAt)}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${STATUS_TONE[r.status] || ""}`}>
              {STATUS_LABEL[r.status] || r.status}
            </span>
          </div>

          <div className="bg-gray-50 rounded-lg divide-y">
            {r.items.map((it) => (
              <div key={it.productId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">{it.name}</span>
                <span className="text-gray-500">
                  {it.qty} {it.unit}
                </span>
              </div>
            ))}
          </div>

          {r.note && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">ملاحظة المندوب</p>
              <p className="text-base text-gray-800">{r.note}</p>
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {canDecide && (
            <div className="border-t pt-4">
              <p className="text-xs text-gray-400 mb-3">هذا أمر شحن من مبيعات التجزئة بانتظار موافقتك.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => decide("approve")}
                  disabled={acting}
                  className="flex-1 bg-accent text-on-accent rounded-lg h-12 text-base font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {acting && <Spinner className="w-4 h-4" />}
                  موافقة
                </button>
                <button
                  onClick={() => decide("reject")}
                  disabled={acting}
                  className="text-base text-red-600 bg-red-50 rounded-lg px-5 h-12 disabled:opacity-50"
                >
                  رفض
                </button>
              </div>
            </div>
          )}

          {canFulfill && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs text-gray-500">عدّل الكميات إذا اختلفت عمّا طُلب، ثم أكّد.</p>
              <div className="space-y-2">
                {r.items.map((it) => (
                  <div key={it.productId} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-700">{it.name}</p>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={qtyOverrides[it.productId] ?? ""}
                      onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [it.productId]: e.target.value }))}
                      className="w-24 border rounded-lg px-2 h-10 text-sm text-center"
                    />
                  </div>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="ملاحظتك (اختياري)"
                className="w-full border rounded-lg px-3 py-2 text-base"
              />
              <button
                onClick={fulfill}
                disabled={acting}
                className="w-full bg-accent text-on-accent rounded-lg h-12 text-base font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {acting && <Spinner className="w-4 h-4" />}
                {r.type === "offloading" ? "تأكيد الاستلام" : "إرسال للتأكيد"}
              </button>
            </div>
          )}

          {r.status === "fulfilled" && r.fulfilledDocId && (
            <Link href={`/inventory/${r.fulfilledDocId}`} className="block text-sm text-gray-600 underline">
              فتح المستند ←
            </Link>
          )}

          {r.status === "pending_warehouse" && !canFulfill && (
            <p className="text-sm text-gray-500 border-t pt-4">بانتظار تنفيذ أمين المخزن.</p>
          )}
          {r.status === "pending_car1" && !canDecide && (
            <p className="text-sm text-gray-500 border-t pt-4">بانتظار موافقة مبيعات الجملة.</p>
          )}
        </div>
      </div>
    </div>
  );
}
