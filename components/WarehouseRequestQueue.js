import { useEffect, useState } from "react";
import WarehouseRequestActions from "./WarehouseRequestActions";
import SuccessScreen from "./SuccessScreen";
import { SkeletonRows } from "./Loading";
import Icon from "./Icon";
import { apiFetch } from "../lib/apiFetch";
import { invalidate } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { formatDateTime, formatQty } from "../lib/labels";
import { SHIPMENT_TYPE_LABELS } from "../lib/shipmentStatus";

const ROUTE_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };

// The warehouse keeper's queue of requests waiting on him. Used on
// /warehouse/shipment-requests (every car) and inside each car's own
// section, /warehouse/car1 and /warehouse/car2 (`route` set), so a
// wholesale request shows up under مبيعات جملة and a retail one under
// مبيعات تجزئة.
//
// Each request is shown READ-ONLY — what the agent asked for, exactly —
// with the two allowed actions: accept or cancel (with a reason).
export default function WarehouseRequestQueue({ token, route, emptyText = "لا توجد طلبات بانتظار التنفيذ." }) {
  const [requests, setRequests] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { action, request, docId, dailySeq, note }

  async function load() {
    setError("");
    try {
      const q = new URLSearchParams({ status: "pending_warehouse" });
      if (route) q.set("route", route);
      const res = await apiFetch(`/api/shipment-requests/list?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRequests(data.requests);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, route]);

  useLiveRefresh(token, ["shipmentRequests"], () => {
    invalidate("/api/shipment-requests");
    load();
  });

  if (done) {
    const r = done.request;
    const label = SHIPMENT_TYPE_LABELS[r.type];
    const next = { label: requests.length ? "الطلب التالي" : "العودة للطلبات", onClick: () => setDone(null) };
    return done.action === "cancelled" ? (
      <SuccessScreen
        tone="warn"
        title={`تم إلغاء ${label}`}
        hint={`أُبلغ المندوب (${ROUTE_LABEL[r.route]}) بسبب الإلغاء: «${done.note}»`}
        secondary={{ label: "عرض الطلب", href: `/shipping/${r.id}` }}
        primary={next}
      />
    ) : (
      <SuccessScreen
        title={r.type === "offloading" ? "تم استلام مرتجع البضاعة" : "تم تنفيذ أمر الشحن"}
        number={done.dailySeq ? `#${done.dailySeq}` : undefined}
        hint={
          r.type === "offloading"
            ? `أُضيفت الكميات إلى المخزن — ${ROUTE_LABEL[r.route]}. لا حاجة لتأكيد إضافي.`
            : `بانتظار تأكيد المندوب (${ROUTE_LABEL[r.route]}) لاستلام البضاعة على السيارة.`
        }
        secondary={{ label: "فتح المستند", href: `/inventory/${done.docId}` }}
        primary={next}
      />
    );
  }

  if (fetching) return <SkeletonRows count={3} />;

  return (
    <div>
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5 mb-3">
          {error}
        </p>
      )}
      {requests.length === 0 ? (
        <p className="text-muted bg-white rounded-2xl border border-dashed border-line px-4 py-6 text-center">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Icon name={r.type === "offloading" ? "box" : "truck"} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">
                    {SHIPMENT_TYPE_LABELS[r.type]}
                    <span className="text-xs font-semibold text-muted ms-2">{ROUTE_LABEL[r.route]}</span>
                  </p>
                  <p className="text-xs text-muted mt-0.5">{formatDateTime(r.requestedAt)}</p>
                </div>
              </div>

              {/* Read-only: the keeper sees exactly what was asked for. */}
              <div className="rounded-xl bg-surface-2 divide-y divide-line mb-3">
                {r.items.map((it) => (
                  <div key={it.productId} className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-ink">{it.name}</span>
                    <span className="num font-semibold text-ink tabular-ltr">
                      {formatQty(it.qty)} <span className="text-muted font-normal">{it.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
              {r.note && <p className="text-sm text-ink-soft mb-3">ملاحظة المندوب: {r.note}</p>}

              <WarehouseRequestActions
                request={r}
                token={token}
                onDone={(result) => {
                  setDone({ ...result, request: r });
                  setRequests((prev) => prev.filter((x) => x.id !== r.id));
                  load();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
