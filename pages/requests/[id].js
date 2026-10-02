import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDateTime, formatNumber, formatQty } from "../../lib/labels";
import { FIELD_LABELS } from "../../lib/clientFields";
import SuccessScreen from "../../components/SuccessScreen";

const fmtField = (k, v) => (k === "active" ? (v ? "نشط" : "موقوف") : v || "—");

// Client-details change: each changed field, now vs requested.
function ClientDiff({ current, proposed }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-3 text-xs font-semibold bg-gray-50 text-gray-600 px-3 py-2">
        <span>الحقل</span>
        <span>الآن</span>
        <span className="text-green-700">المطلوب</span>
      </div>
      <div className="divide-y">
        {Object.keys(proposed || {}).map((k) => (
          <div key={k} className="grid grid-cols-3 gap-2 px-3 py-2.5 text-sm">
            <span className="text-gray-600">{FIELD_LABELS[k] || k}</span>
            <span className="text-gray-800 break-words">{fmtField(k, current?.[k])}</span>
            <span className="text-green-800 font-semibold break-words">{fmtField(k, proposed[k])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemsTable({ title, items, total, discount, tone = "gray" }) {
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
              {formatQty(it.qty)} × {formatNumber(it.price)} = {formatNumber(it.subtotal ?? it.price * it.qty)}
            </span>
          </div>
        ))}
      </div>
      {discount > 0 && (
        <p className="text-end text-sm text-blue-700 px-3 pt-2 border-t">خصم الفاتورة: − {formatNumber(discount)}</p>
      )}
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
  const [decided, setDecided] = useState(null); // "approve" | "reject"

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
        ? r.type === "client_edit"
          ? "الموافقة ستغيّر بيانات العميل كما طلب المندوب. متابعة؟"
          : r.type === "cancel"
          ? "الموافقة ستلغي الفاتورة وتعيد كمياتها إلى السيارة. متابعة؟"
          : "الموافقة ستعدّل الفاتورة وتحدّث المخزون. متابعة؟"
        : r.type === "client_edit"
        ? "رفض الطلب؟ تبقى بيانات العميل كما هي."
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
      setDecided(action);
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

  const isClientEdit = r.type === "client_edit";
  const invoiceChanged = !isClientEdit && r.order && r.status === "pending" && r.order.total !== r.currentTotal;

  if (decided) {
    return (
      <div className="min-h-screen bg-canvas">
        <Nav role={role} logout={logout} />
        <main className="max-w-lg mx-auto px-4 pt-5 pb-8 sm:px-0">
          <SuccessScreen
            tone={decided === "approve" ? "success" : "warn"}
            title={decided === "approve" ? "تمت الموافقة على الطلب" : "تم رفض الطلب"}
            hint={
              decided === "approve"
                ? isClientEdit
                  ? "تم تحديث بيانات العميل وأُبلغ المندوب."
                  : "تم تطبيق التغيير على الفاتورة وأُبلغ المندوب."
                : "أُبلغ المندوب بالقرار."
            }
            secondary={{ label: "عرض الطلب", onClick: () => setDecided(null) }}
            primary={{ label: "الطلبات المعلقة", href: "/requests" }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-5 sm:p-6 space-y-4">
          <div>
            <BackButton />
            <h1 className="text-xl font-semibold text-gray-800">
              {isClientEdit ? "طلب تعديل بيانات عميل" : r.type === "cancel" ? "طلب إلغاء فاتورة" : "طلب تعديل فاتورة"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {r.clientName} — {r.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة"} ·{" "}
              <Link href={isClientEdit ? `/clients/${r.clientId}` : `/orders/${r.orderId}`} className="underline">
                {isClientEdit ? `فتح العميل #${r.clientId}` : "فتح الفاتورة"}
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

          {isClientEdit ? (
            <ClientDiff current={r.status === "pending" && r.client ? r.client : r.currentClient} proposed={r.proposedClient} />
          ) : (
          <>
          <ItemsTable
            title={r.status === "pending" ? "الفاتورة الآن" : "الفاتورة وقت الطلب"}
            items={r.status === "pending" && r.order ? r.order.items : r.currentItems}
            total={r.status === "pending" && r.order ? r.order.total : r.currentTotal}
            discount={r.status === "pending" && r.order ? Number(r.order.discount) || 0 : Number(r.currentDiscount) || 0}
          />
          {r.type === "edit" && (
            <ItemsTable
              title="التعديل المطلوب"
              items={r.proposedItems}
              total={r.proposedTotal}
              discount={Number(r.proposedDiscount) || 0}
              tone="green"
            />
          )}
          </>
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
                {isClientEdit
                  ? "عند الموافقة تُحدَّث بيانات العميل بالقيم المطلوبة."
                  : r.type === "edit"
                  ? "عند الموافقة يُطبَّق التعديل بالأسعار الحالية ويُتحقق من كفاية المخزون."
                  : "عند الموافقة تُلغى الفاتورة وتعود كمياتها إلى السيارة."}
              </p>
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
