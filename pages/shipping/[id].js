import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import { getAuthFlags } from "../../lib/authFlags";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import SuccessScreen from "../../components/SuccessScreen";
import WarehouseRequestActions from "../../components/WarehouseRequestActions";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDateTime, formatQty } from "../../lib/labels";
import { markSeen } from "../../lib/notificationSeen";
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_TONE, SHIPMENT_TYPE_LABELS } from "../../lib/shipmentStatus";

const ROUTE_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };
const RESOLVED = ["rejected", "fulfilled", "cancelled"];

// One shipping order / cargo return. Read-only for everyone: the
// warehouse keeper can only accept it as-is or cancel it with a reason;
// car1 can approve/reject a car2 loading request.
export default function ShippingDetail() {
  const { role, token, user, loading, logout } = useAuth(["manager", "warehouse_keeper", "agent_car1", "agent_car2"]);
  const router = useRouter();
  const { id } = router.query;

  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState(null);

  async function fetchDoc() {
    if (!token || !id) return;
    try {
      const res = await apiFetch(`/api/shipment-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setR(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    fetchDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  useLiveRefresh(token, ["shipmentRequests"], () => {
    invalidate("/api/shipment-requests");
    fetchDoc();
  });

  // Opening this page acknowledges a resolved notification about it.
  useEffect(() => {
    if (!r || !user) return;
    if (r.requestedBy === user.uid && RESOLVED.includes(r.status)) markSeen(user.uid, r.id);
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
      setDone({ action: action === "approve" ? "approved" : "rejected" });
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <PageLoading />;

  if (!r) {
    return (
      <div className="min-h-screen bg-canvas">
        <Nav role={role} logout={logout} />
        <main className="max-w-2xl mx-auto px-4 pt-5 sm:px-8">
          <BackButton />
          <p className="text-red-600 text-sm">{error || "جارٍ التحميل..."}</p>
        </main>
      </div>
    );
  }

  const canDecide = getAuthFlags().salesSupervisor && r.requestedBy !== user?.uid && r.status === "pending_car1";
  const canAct = role === "warehouse_keeper" && r.status === "pending_warehouse";
  const home = role === "warehouse_keeper" ? `/warehouse/${r.route}` : "/documents";

  if (done) {
    const label = SHIPMENT_TYPE_LABELS[r.type];
    const back = { label: role === "warehouse_keeper" ? "العودة للطلبات" : "المستندات", href: home };
    let screen;
    if (done.action === "fulfilled") {
      screen = (
        <SuccessScreen
          title={r.type === "offloading" ? "تم استلام مرتجع البضاعة" : "تم تنفيذ أمر الشحن"}
          number={done.dailySeq ? `#${done.dailySeq}` : undefined}
          hint={r.type === "offloading" ? "أُضيفت الكميات إلى المخزن." : "أُرسل «تسليم بضاعة» للمندوب — بانتظار تأكيده للاستلام."}
          secondary={{ label: "فتح المستند", href: `/inventory/${done.docId}` }}
          primary={back}
        />
      );
    } else if (done.action === "cancelled") {
      screen = <SuccessScreen tone="warn" title={`تم إلغاء ${label}`} hint={`أُبلغ المندوب بالسبب: «${done.note}»`} primary={back} />;
    } else {
      screen = (
        <SuccessScreen
          tone={done.action === "rejected" ? "warn" : "success"}
          title={done.action === "approved" ? "تمت الموافقة على أمر الشحن" : "تم رفض أمر الشحن"}
          hint={done.action === "approved" ? "انتقل الطلب إلى أمين المخزن للتنفيذ." : "أُبلغ مندوب التجزئة بالرفض."}
          primary={{ label: "المستندات", href: "/documents" }}
        />
      );
    }
    return (
      <div className="min-h-screen bg-canvas">
        <Nav role={role} logout={logout} />
        <main className="max-w-lg mx-auto px-4 pt-5 pb-8 sm:px-0">
          <h1 className="font-display text-2xl font-bold mb-4 text-ink">{label}</h1>
          {screen}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <BackButton href={home} />
        <div className="bg-white rounded-2xl shadow p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="font-display text-xl font-bold text-ink">{SHIPMENT_TYPE_LABELS[r.type]}</h1>
              <p className="text-sm text-muted mt-1">من: {ROUTE_LABEL[r.route]}</p>
              <p className="text-xs text-muted mt-1">طُلب {formatDateTime(r.requestedAt)}</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${SHIPMENT_STATUS_TONE[r.status] || ""}`}>
              {SHIPMENT_STATUS_LABELS[r.status] || r.status}
            </span>
          </div>

          <div className="bg-surface-2 rounded-xl divide-y divide-line">
            {r.items.map((it) => (
              <div key={it.productId} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="text-ink">{it.name}</span>
                <span className="num font-semibold text-ink tabular-ltr">
                  {formatQty(it.qty)} <span className="text-muted font-normal">{it.unit}</span>
                </span>
              </div>
            ))}
          </div>

          {r.note && (
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-xs text-muted mb-1">ملاحظة المندوب</p>
              <p className="text-base text-ink">{r.note}</p>
            </div>
          )}

          {r.status === "cancelled" && (
            <div className="bg-red-50 rounded-xl p-3">
              <p data-no-spotlight className="text-xs text-red-600 font-semibold mb-1">ألغاه أمين المخزن — {formatDateTime(r.cancelledAt)}</p>
              <p className="text-base text-ink">{r.cancelNote}</p>
            </div>
          )}
          {r.status === "rejected" && r.car1Decision?.note && (
            <div className="bg-red-50 rounded-xl p-3">
              <p data-no-spotlight className="text-xs text-red-600 font-semibold mb-1">سبب الرفض</p>
              <p className="text-base text-ink">{r.car1Decision.note}</p>
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {canAct && (
            <div className="border-t border-line pt-4">
              <WarehouseRequestActions
                request={r}
                token={token}
                onDone={(result) => {
                  setDone(result);
                  fetchDoc();
                }}
              />
            </div>
          )}

          {canDecide && (
            <div className="border-t border-line pt-4">
              <p className="text-xs text-muted mb-3">هذا أمر شحن من مبيعات التجزئة بانتظار موافقتك.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => decide("reject")}
                  disabled={acting}
                  className="h-12 rounded-xl bg-red-50 text-red-600 font-bold disabled:opacity-50"
                >
                  رفض
                </button>
                <button
                  type="button"
                  onClick={() => decide("approve")}
                  disabled={acting}
                  className="h-12 rounded-xl bg-accent text-on-accent font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {acting && <Spinner className="w-4 h-4" />}
                  موافقة
                </button>
              </div>
            </div>
          )}

          {r.status === "fulfilled" && r.fulfilledDocId && (
            <Link href={`/inventory/${r.fulfilledDocId}`} className="block text-sm font-semibold text-accent-ink underline">
              فتح المستند
            </Link>
          )}
          {r.status === "pending_warehouse" && !canAct && (
            <p className="text-sm text-muted border-t border-line pt-4">بانتظار تنفيذ أمين المخزن.</p>
          )}
          {r.status === "pending_car1" && !canDecide && (
            <p className="text-sm text-muted border-t border-line pt-4">بانتظار موافقة مشرف المبيعات.</p>
          )}
        </div>
      </main>
    </div>
  );
}
