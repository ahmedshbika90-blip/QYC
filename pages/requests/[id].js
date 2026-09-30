import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDateTime, formatNumber } from "../../lib/labels";

function ItemsTable({ title, items, total, tone = "gray" }) {
  return (
    <div className={`border rounded-lg overflow-hidden ${tone === "green" ? "border-green-200" : ""}`}>
      <p className={`text-sm font-medium px-3 py-2 ${tone === "green" ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-700"}`}>
        {title}
      </p>
      <div className="divide-y">
        {(items || []).map((it, i) => (
          <div key={i} className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-800">{it.name}</span>
            <span className="text-gray-600">
              {it.qty} × {formatNumber(it.price)} = {formatNumber(it.subtotal ?? it.price * it.qty)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-end text-sm font-semibold px-3 py-2 border-t">الإجمالي: {formatNumber(total)}</p>
    </div>
  );
}

export default function RequestDetail() {
  const { role, token, loading, logout } = useAuth(["supervisor", "agent_car1", "agent_car2"]);
  const router = useRouter();
  const { id } = router.query;
  const [r, setR] = useState(null);
  const [note, setNote] = useState("");
  const [fetching, setFetching] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function load() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch(`/api/requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setR(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function decide(action) {
    const msg =
      action === "approve"
        ? r.type === "cancel"
          ? "الموافقة ستلغي الفاتورة وتعيد كمياتها إلى السيارة. متابعة؟"
          : "الموافقة ستعدّل الفاتورة وتحدّث المخزون. متابعة؟"
        : "رفض الطلب؟ تبقى الفاتورة كما هي.";
    if (!confirm(msg)) return;
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/requests/${id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/requests");
      invalidate("/api/orders/list");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  useLiveRefresh(token, ["requests"], load);

  if (loading || fetching) return <PageLoading />;
  if (!r) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-red-600 text-sm">{error || "الطلب غير موجود"}</p>
      </div>
    );
  }

  const invoiceChanged = r.order && r.status === "pending" && r.order.total !== r.currentTotal;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-5 sm:p-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              {r.type === "cancel" ? "طلب إلغاء فاتورة" : "طلب تعديل فاتورة"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {r.clientName} — {r.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة"} ·{" "}
              <Link href={`/orders/${r.orderId}`} className="underline">
                فتح الفاتورة
              </Link>
            </p>
            <p className="text-xs text-gray-400 mt-1">طُلب {formatDateTime(r.requestedAt)}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">سبب الطلب</p>
            <p className="text-base text-gray-800">{r.reason}</p>
          </div>

          {invoiceChanged && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              تغيّرت الفاتورة منذ تقديم الطلب — راجع الوضع الحالي أدناه قبل القرار.
            </p>
          )}

          <ItemsTable
            title={r.status === "pending" ? "الفاتورة الآن" : "الفاتورة وقت الطلب"}
            items={r.status === "pending" && r.order ? r.order.items : r.currentItems}
            total={r.status === "pending" && r.order ? r.order.total : r.currentTotal}
          />
          {r.type === "edit" && (
            <ItemsTable title="التعديل المطلوب" items={r.proposedItems} total={r.proposedTotal} tone="green" />
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {r.status === "pending" && role === "supervisor" ? (
            <div className="border-t pt-4 space-y-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="ملاحظة للمندوب (اختياري)"
                className="w-full border rounded-lg px-3 py-2 text-base"
              />
              <p className="text-xs text-gray-400">
                {r.type === "edit"
                  ? "عند الموافقة يُطبَّق التعديل بالأسعار الحالية ويُتحقق من كفاية المخزون."
                  : "عند الموافقة تُلغى الفاتورة وتعود كمياتها إلى السيارة."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => decide("approve")}
                  disabled={acting}
                  className="flex-1 bg-gray-900 text-white rounded-lg h-12 text-base font-medium disabled:opacity-50 flex items-center justify-center gap-2"
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
          ) : (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                r.status === "approved"
                  ? "bg-green-50 text-green-700"
                  : r.status === "rejected"
                  ? "bg-red-50 text-red-600"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {r.status === "approved" ? "تمت الموافقة" : r.status === "rejected" ? "تم الرفض" : "بانتظار قرار المشرف"}
              {r.decidedAt && <> — {formatDateTime(r.decidedAt)}</>}
              {r.decisionNote && <span className="block text-xs mt-0.5">الملاحظة: {r.decisionNote}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
