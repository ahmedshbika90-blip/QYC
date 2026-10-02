import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import StatusTabs from "../../components/StatusTabs";
import PeriodTabs, { periodStartISO } from "../../components/PeriodTabs";
import FilterPanel from "../../components/FilterPanel";
import OrderCard from "../../components/OrderCard";
import QuickActions from "../../components/QuickActions";
import { TodayHeader, ActionInbox, SectionTitle, todayStats } from "../../components/Today";
import { previewNames } from "../../components/InventoryDocCard";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import Icon from "../../components/Icon";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { getClients } from "../../lib/clientsStore";
import { formatDateTime, formatNumber } from "../../lib/labels";

export default function Car1Dashboard() {
  const { user, role, token, loading, logout } = useAuth(["agent_car1"]);
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clientsById, setClientsById] = useState({});
  const [pendingMovements, setPendingMovements] = useState([]);
  const [toDecide, setToDecide] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("active");
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [storeClass, setStoreClass] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [period, setPeriod] = useState(7); // days; ignored when a custom date range is set

  useEffect(() => {
    if (!token) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dateFrom, dateTo, period]);

  function ordersUrl(cursor) {
    const params = new URLSearchParams();
    params.set("from", dateFrom || periodStartISO(period));
    if (dateTo) params.set("to", dateTo);
    if (cursor) params.set("cursor", cursor);
    return `/api/orders/list?${params.toString()}`;
  }

  async function fetchAll() {
    setFetching(true);
    setError("");
    try {
      const [ordersData, clients, pendingData, toDecideData] = await Promise.all([
        cachedGet(apiFetch, ordersUrl(), token),
        getClients(apiFetch, token, user.uid),
        cachedGet(apiFetch, "/api/inventory/list?status=pending", token),
        cachedGet(apiFetch, "/api/shipment-requests/list?scope=todecide", token),
      ]);
      setOrders(ordersData.orders);
      setNextCursor(ordersData.nextCursor);
      setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
      setPendingMovements(pendingData.docs);
      setToDecide(toDecideData.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await cachedGet(apiFetch, ordersUrl(nextCursor), token);
      setOrders((prev) => [...prev, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function updateStatus(orderId, status) {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      invalidate("/api/orders/list");
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  }

  const matchesFilters = useMemo(() => {
    return (order) => {
      if (nameQuery) {
        const name = clientsById[order.clientId]?.name || "";
        if (!name.toLowerCase().includes(nameQuery.toLowerCase())) return false;
      }
      if (locationQuery) {
        const location = clientsById[order.clientId]?.location || "";
        if (!location.toLowerCase().includes(locationQuery.toLowerCase())) return false;
      }
      if (storeClass && clientsById[order.clientId]?.storeClass !== storeClass) return false;
      return true;
    };
  }, [clientsById, nameQuery, locationQuery, storeClass]);

  const baseFiltered = useMemo(() => orders.filter(matchesFilters), [orders, matchesFilters]);
  const counts = useMemo(
    () => ({
      active: baseFiltered.filter((o) => o.status !== "cancelled").length,
      cancelled: baseFiltered.filter((o) => o.status === "cancelled").length,
    }),
    [baseFiltered]
  );
  const visible = useMemo(
    () =>
      statusFilter === "cancelled"
        ? baseFiltered.filter((o) => o.status === "cancelled")
        : baseFiltered.filter((o) => o.status !== "cancelled"),
    [baseFiltered, statusFilter]
  );

  useLiveRefresh(token, ["orders_car1", "inventory", "shipmentRequests"], () => {
    invalidate("/api/orders/list");
    invalidate("/api/inventory");
    invalidate("/api/shipment-requests");
    fetchAll();
  });

  const today = useMemo(() => todayStats(orders), [orders]);

  // MAIN inbox = only work that belongs to THIS agent's own shipment
  // deliveries (things the warehouse pushed to him and he must confirm).
  // Requests from car2 waiting on car1's approval used to live here too;
  // that mixed two very different jobs. They now live in their own
  // "بانتظار موافقتي" section below, with an amber dot on the section
  // title while anything is unapproved.
  // The documents themselves live in المستندات ← الأرشيف, pinned at the
  // top there with a direct confirm link and a dot on the tab. This is a
  // single pointer to that queue rather than a second copy of the same
  // list in two places.
  const inbox =
    pendingMovements.length > 0
      ? [
          {
            key: "pendingdocs",
            href: "/documents?tab=archive",
            icon: "truck",
            tone: "warn",
            title: `${pendingMovements.length} ${
              pendingMovements.length === 1 ? "مستند بانتظار تأكيدك" : "مستندات بانتظار تأكيدك"
            }`,
            meta: "في المستندات ← الأرشيف",
            cta: "افتح",
          },
        ]
      : [];

  const toDecideCount = toDecide.length;

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <TodayHeader
          title="مبيعات جملة"
          subtitle="حسب الطلب"
          stats={[
            { label: "فواتير اليوم", value: fetching ? "…" : today.count },
            { label: "مبيعات اليوم", value: fetching ? "…" : formatNumber(today.total) },
          ]}
        />

        <QuickActions
          actions={[
            { href: "/place-order", label: "فاتورة جديدة", icon: "plus" },
            { href: "/register-client", label: "إضافة عميل", icon: "userPlus" },
          ]}
        />

        <ActionInbox items={inbox} loading={fetching && orders.length === 0} emptyText="لا شيء بانتظارك — يومك على المسار" />

        {/* Requests coming from the OTHER agent (car2) that this agent
            gates before they reach the warehouse. Kept separate from the
            main inbox because it's a different mental job: reviewing
            someone else's request, not confirming your own delivery.
            The amber dot on the header stays lit while anything remains
            unapproved; it clears when the list is empty. */}
        <ApprovalQueue items={toDecide} loading={fetching} />

        <SectionTitle>الفواتير</SectionTitle>

        <PeriodTabs
          value={dateFrom || dateTo ? null : period}
          onChange={(days) => {
            setPeriod(days);
            setDateFrom("");
            setDateTo("");
          }}
        />

        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
          <StatusTabs value={statusFilter} onChange={setStatusFilter} counts={counts} />
          <FilterPanel
            nameQuery={nameQuery}
            onNameChange={setNameQuery}
            locationQuery={locationQuery}
            onLocationChange={setLocationQuery}
            storeClass={storeClass}
            onStoreClassChange={setStoreClass}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
          />
        </div>

        {(nameQuery || locationQuery || storeClass) && nextCursor && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-3">
            البحث يشمل الفواتير المحمّلة فقط — اضغط &quot;تحميل المزيد&quot; أو حدد فترة لنتائج أشمل.
          </p>
        )}

        {error && (
          <div role="alert" className="text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="font-semibold underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : (
          <>
            {visible.length === 0 && (
              <p className="text-muted text-sm bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد فواتير مطابقة.</p>
            )}
            <div className="space-y-2 mb-3">
              {visible.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  name={clientsById[order.clientId]?.name}
                  location={clientsById[order.clientId]?.location}
                  subtitle={formatDateTime(order.createdAt)}
                  onStatusChange={updateStatus}
                  canCancel={!order.locked}
                />
              ))}
            </div>

            {nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full bg-white rounded-2xl shadow text-sm font-semibold text-ink-soft h-12 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingMore && <Spinner className="w-4 h-4" />}
                {loadingMore ? "جارٍ التحميل..." : "تحميل المزيد"}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Isolated block for approvals originating from the OTHER agent. Its
// visual language (blue-ish info tone + a distinct icon) is deliberately
// different from the amber "your own delivery to confirm" cards above so
// the two jobs don't get conflated at a glance.
function ApprovalQueue({ items, loading }) {
  const count = items.length;

  return (
    <section aria-label="بانتظار موافقتي" className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-ink">بانتظار موافقتي</h2>
          {count > 0 && (
            <span className="relative inline-flex">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-canvas" />
              <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-70" />
            </span>
          )}
          {count > 0 && (
            <span className="num min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted">من مبيعات التجزئة</p>
      </div>

      {loading && count === 0 ? (
        <div className="bg-white rounded-2xl shadow h-[68px] animate-pulse" />
      ) : count === 0 ? (
        <div className="bg-white rounded-2xl shadow px-4 py-3.5 flex items-center gap-3 border border-dashed border-line">
          <span className="w-10 h-10 rounded-xl bg-surface-2 text-muted flex items-center justify-center">
            <Icon name="inbox" size={18} />
          </span>
          <p className="text-sm text-muted">لا طلبات بانتظار موافقتك</p>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden border-r-4 border-amber-400">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/shipping/${r.id}`}
                className="flex items-center gap-3 px-3.5 py-3 min-h-[68px] active:bg-surface-2"
              >
                <span className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Icon name={r.type === "offloading" ? "box" : "truck"} size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink leading-snug line-clamp-2">
                    {r.type === "loading" ? "أمر شحن" : "مرتجع بضاعة"} من التجزئة
                  </span>
                  <span className="block text-xs text-muted truncate mt-0.5">
                    {previewNames(r.items)} · {formatDateTime(r.requestedAt)}
                  </span>
                </span>
                <span className="shrink-0 h-8 px-3 rounded-lg text-[13px] font-bold flex items-center bg-amber-100 text-amber-700">
                  راجِع
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
