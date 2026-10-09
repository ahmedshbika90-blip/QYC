import { getAuthFlags } from "../lib/authFlags";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProductCartPicker from "./ProductCartPicker";
import SuccessScreen from "./SuccessScreen";
import Icon from "./Icon";
import { SkeletonRows, Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { invalidate } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { useRequestId } from "../lib/useRequestId";
import { useNotifications } from "../lib/useNotifications";
import { markSeen } from "../lib/notificationSeen";
import { formatDateTime, formatQty } from "../lib/labels";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_TONE,
  SHIPMENT_TYPE_LABELS,
  isOpenStatus,
} from "../lib/shipmentStatus";

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

function RequestRow({ r }) {
  return (
    <Link href={`/shipping/${r.id}`} className="block p-4 hover:bg-surface-2 active:bg-surface-2">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{SHIPMENT_TYPE_LABELS[r.type]}</p>
          <p className="text-sm text-muted truncate mt-0.5">
            {r.items.map((it) => `${it.name} ×${formatQty(it.qty)}`).join("، ")}
          </p>
          <p className="text-xs text-muted mt-1">{formatDateTime(r.requestedAt)}</p>
          {r.status === "cancelled" && r.cancelNote && (
            <p data-no-spotlight className="text-sm text-red-600 mt-1.5">سبب الإلغاء: {r.cancelNote}</p>
          )}
          {r.status === "rejected" && r.car1Decision?.note && (
            <p data-no-spotlight className="text-sm text-red-600 mt-1.5">سبب الرفض: {r.car1Decision.note}</p>
          )}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${SHIPMENT_STATUS_TONE[r.status] || ""}`}>
          {SHIPMENT_STATUS_LABELS[r.status] || r.status}
        </span>
      </div>
    </Link>
  );
}

// Agent's shipping orders / cargo returns, embedded in /documents (tab
// "شحن"): send a new one, see your own, and (car1 only) approve/reject
// car2's loading requests.
//
// Rules this screen makes visible (the server enforces all of them too):
//  - ONE open request at a time. While one is waiting, the form is
//    replaced by a card pointing at it; it comes back once the warehouse
//    keeper executes or cancels that request.
//  - A cargo return (مرتجع) lists ONLY what's on this car right now, and
//    each line is capped at the car's quantity. A shipping order is capped
//    at what the depot has.
//  - On success the form is replaced by the shared success card.
export default function ShipmentRequestsPanel({ role, token }) {
  // "طلباتي" filter. Type is shipping order / goods return only — there is
  // deliberately no "تالف" (damage) option for agents.
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // One screen: "طلباتي" (with what needs you on top) and a clear
  // "طلب جديد" button that asks shipping order or goods return first.
  const [tab, setTab] = useState("own");
  const [choosing, setChoosing] = useState(false);
  const uid = getAuthFlags().uid;
  const notif = useNotifications(token, role, uid);
  // Shipping items that need this person (confirm a delivery, approve a
  // request…) or that changed since they last looked — the same items the
  // nav's badge on المستندات counts, now spelled out here.
  const actionItems = (notif.items || []).filter((it) => it.bucket === "shipping");
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
  const [done, setDone] = useState(null); // { id, type } after a successful send
  const requestIds = useRequestId();

  const myRoute = getAuthFlags().route || ROLE_TO_ROUTE[role]; // the account's van
  const sourceField = type === "loading" ? "depot" : myRoute;
  const availableOf = (p) => (p ? Number(p.stock?.[sourceField] ?? 0) : 0);
  const sourceLabel = type === "loading" ? "المخزن" : "العربة";
  const availableProducts = products.filter((p) => availableOf(p) > 0);
  const openRequest = own.find((r) => isOpenStatus(r.status));

  function loadProducts() {
    apiFetch("/api/products/list?all=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setProducts((d.products || []).filter((p) => p.active !== false)))
      .catch(() => {});
  }

  async function loadLists() {
    setFetching(true);
    try {
      const ownRes = await apiFetch("/api/shipment-requests/list?scope=own", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ownData = await ownRes.json();
      if (!ownRes.ok) throw new Error(ownData.error);
      setOwn(ownData.requests);

      if (getAuthFlags().salesSupervisor) {
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
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useLiveRefresh(token, ["shipmentRequests", "inventory"], () => {
    invalidate("/api/shipment-requests");
    loadLists();
    loadProducts(); // car stock changes as goods are sold/loaded
  });

  // Switching direction invalidates the cart: quantities were capped
  // against a different source.
  function changeType(next) {
    if (next === type) return;
    setType(next);
    setCart([]);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (cart.length === 0) {
      setError("أضف منتجًا واحدًا على الأقل");
      return;
    }
    const over = cart.find((it) => it.qty > availableOf(products.find((p) => p.id === it.productId)));
    if (over) {
      setError(`الكمية المطلوبة من "${over.name}" أكبر من المتاح في ${sourceLabel}`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = { type, items: cart.map((it) => ({ productId: it.productId, qty: it.qty })), note };
      const res = await apiFetch("/api/shipment-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, requestId: requestIds.idFor(payload) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      setCart([]);
      setNote("");
      setDone({ id: data.id, type });
      invalidate("/api/shipment-requests");
      loadLists();
    } catch (err) {
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
      loadLists(); // e.g. "you already have an open request" — show it
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

  const doneHint =
    done?.type === "offloading"
      ? "بانتظار استلام أمين المخزن. ستصلك رسالة عند التنفيذ أو الإلغاء."
      : !getAuthFlags().salesSupervisor
      ? "بانتظار موافقة مشرف المبيعات ثم تنفيذ أمين المخزن."
      : "بانتظار تنفيذ أمين المخزن. ستحتاج لتأكيد الاستلام على السيارة بعدها.";

  return (
    <div>
      {tab === "own" ? (
        <button
          type="button"
          onClick={() => {
            setError("");
            setChoosing(true);
          }}
          className="w-full h-14 mb-5 rounded-2xl bg-accent text-on-accent text-lg font-bold flex items-center justify-center gap-2 shadow active:bg-accent-strong"
        >
          <Icon name="plus" size={24} strokeWidth={2.6} />
          طلب جديد
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setTab("own");
            setDone(null);
            setError("");
          }}
          className="mb-4 h-11 px-3 rounded-xl text-ink font-semibold flex items-center gap-1.5 hover:bg-surface-2"
        >
          <Icon name="chevronRight" size={20} className="rtl:rotate-0 ltr:rotate-180" />
          طلباتي
        </button>
      )}

      {choosing && (
        <div role="dialog" aria-modal="true" aria-labelledby="new-req-title" className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setChoosing(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 flex flex-col gap-3" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            <h2 id="new-req-title" className="font-display text-xl font-bold text-ink">ماذا تريد أن تطلب؟</h2>
            {[
              ["loading", "أمر شحن", "بضاعة من المخزن إلى سيارتك", "truck"],
              ["offloading", "مرتجع بضاعة", "تفريغ بضاعة من سيارتك إلى المخزن", "box"],
              ["moneyReturn", "رد مبلغ لعميل", "مبلغ زائد على فاتورة بعد مرتجع — يرده المحاسب", "tag"],
            ].map(([value, label, sub, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (value === "moneyReturn") {
                    window.location.href = "/money-return";
                    return;
                  }
                  changeType(value);
                  setDone(null);
                  setTab("new");
                  setChoosing(false);
                }}
                className="w-full text-start rounded-2xl border-2 border-line hover:border-accent active:bg-accent-soft p-4 flex items-center gap-3 min-h-[5rem]"
              >
                <span className="w-12 h-12 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                  <Icon name={icon} size={24} />
                </span>
                <span>
                  <span className="block text-lg font-bold text-ink">{label}</span>
                  <span className="block text-sm text-ink-soft">{sub}</span>
                </span>
              </button>
            ))}
            <button type="button" onClick={() => setChoosing(false)} className="h-12 rounded-xl text-ink-soft font-semibold">إلغاء</button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === "new" &&
        (done ? (
          <SuccessScreen
            title={done.type === "offloading" ? "تم إرسال مرتجع البضاعة" : "تم إرسال أمر الشحن"}
            hint={doneHint}
            secondary={{ label: "طلباتي", onClick: () => { setDone(null); setTab("own"); } }}
            primary={{ label: "عرض الطلب", href: `/shipping/${done.id}` }}
          />
        ) : fetching && own.length === 0 ? (
          <SkeletonRows count={3} />
        ) : openRequest ? (
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Icon name="lock" size={20} />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-ink">لديك طلب مفتوح</p>
                <p className="text-sm text-muted mt-1 leading-relaxed">
                  لا يمكن إرسال طلب جديد حتى يُنفَّذ طلبك الحالي أو يُلغى من أمين المخزن.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-line overflow-hidden">
              <RequestRow r={openRequest} />
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                <Icon name={type === "offloading" ? "box" : "truck"} size={22} />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">{type === "offloading" ? "مرتجع بضاعة" : "أمر شحن"}</p>
                <p className="text-sm text-ink-soft">{type === "offloading" ? "من السيارة إلى المخزن" : "من المخزن إلى السيارة"}</p>
              </div>
            </div>

            <p className="text-sm text-ink-soft bg-surface-2 rounded-xl px-3 py-2.5">
              {type === "offloading"
                ? "تظهر فقط البضاعة الموجودة في عربتك الآن، ولا يمكنك إرجاع أكثر مما فيها."
                : "بعد تنفيذ أمين المخزن، ستحتاج لتأكيد استلامها على السيارة."}
            </p>

            <ProductCartPicker
              products={availableProducts}
              cart={cart}
              setCart={setCart}
              maxFor={availableOf}
              hint={(p) => `${sourceLabel}: ${formatQty(availableOf(p))}`}
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
              className="w-full border rounded-xl px-3 py-2 text-base"
            />

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full bg-accent text-on-accent rounded-xl h-12 text-base font-semibold active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              {submitting ? "جارٍ الإرسال..." : type === "offloading" ? "إرسال المرتجع" : "إرسال أمر الشحن"}
            </button>
          </form>
        ))}

      {tab === "own" && actionItems.length > 0 && (
        <section aria-labelledby="needs-you" className="mb-5">
          <h2 id="needs-you" className="font-display text-lg font-bold text-ink mb-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600" aria-hidden="true" />
            {actionItems.some((it) => it.needsAction) ? "بحاجة لإجراء منك" : "تحديثات جديدة"}
          </h2>
          <ul className="bg-white rounded-2xl shadow divide-y divide-line border-2 border-amber-300 overflow-hidden">
            {actionItems.map((it) => (
              <li key={it.id}>
                <Link
                  href={it.href}
                  onClick={() => !it.needsAction && markSeen(uid, it.id)}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-ink truncate">{it.requestType}</p>
                    <p className="text-sm text-ink-soft truncate">
                      {it.from && <>من: {it.from}</>}
                      {it.at && <> · {formatDateTime(it.at)}</>}
                    </p>
                    {it.note && <p className="text-sm text-ink-soft line-clamp-2">{it.note}</p>}
                  </div>
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-lg shrink-0 ${it.needsAction ? "bg-amber-100 text-amber-800" : it.tone === "bad" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {it.state}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "own" && getAuthFlags().salesSupervisor && toDecide.length > 0 && (
          <div className="space-y-2 mb-5">
            <h2 className="text-sm font-bold text-amber-700">بانتظار موافقتي — من المندوبين</h2>
            {toDecide.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl shadow p-4">
                <p className="font-semibold text-ink">أمر شحن — {r.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة"}</p>
                <p className="text-sm text-muted mt-0.5">
                  {r.items.map((it) => `${it.name} ×${formatQty(it.qty)}`).join("، ")}
                </p>
                {r.note && <p className="text-xs text-muted mt-1">ملاحظة: {r.note}</p>}
                <p className="text-xs text-muted mt-1">{formatDateTime(r.requestedAt)}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => decide(r.id, "approve")}
                    disabled={acting === r.id}
                    className="flex-1 bg-accent text-on-accent rounded-xl h-11 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acting === r.id && <Spinner className="w-4 h-4" />}
                    موافقة
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r.id, "reject")}
                    disabled={acting === r.id}
                    className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-5 h-11 disabled:opacity-50"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
      )}

      {tab === "own" && <h2 className="font-display text-lg font-bold text-ink mb-2">طلباتي</h2>}
      {tab === "own" && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="نوع الطلب"
            className="border border-line rounded-xl px-3 h-11 text-sm"
          >
            <option value="">كل الأنواع</option>
            <option value="loading">أمر شحن</option>
            <option value="offloading">مرتجع بضاعة</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="حالة الطلب"
            className="border border-line rounded-xl px-3 h-11 text-sm"
          >
            <option value="">كل الحالات</option>
            <option value="pending">قيد الانتظار</option>
            {Object.keys(SHIPMENT_STATUS_LABELS)
              .filter((k) => !k.startsWith("pending"))
              .map((k) => (
                <option key={k} value={k}>{SHIPMENT_STATUS_LABELS[k]}</option>
              ))}
          </select>
        </div>
      )}

      {tab === "own" &&
        (fetching && own.length === 0 ? (
          <SkeletonRows count={4} />
        ) : own.length === 0 ? (
          <p className="text-muted">لا توجد طلبات بعد.</p>
        ) : (
          <div className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
            {own
              .filter((r) => !typeFilter || r.type === typeFilter)
              .filter((r) =>
                !statusFilter ? true : statusFilter === "pending" ? String(r.status).startsWith("pending") : r.status === statusFilter
              )
              .map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
          </div>
        ))}

    </div>
  );
}
