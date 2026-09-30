import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import StatusTabs from "../../components/StatusTabs";
import PeriodTabs, { periodStartISO } from "../../components/PeriodTabs";
import FilterPanel from "../../components/FilterPanel";
import OrderCard from "../../components/OrderCard";
import QuickActions from "../../components/QuickActions";
import { TodayHeader, ActionInbox, SectionTitle, todayStats } from "../../components/Today";
import { TYPE_LABELS, previewNames } from "../../components/InventoryDocCard";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { getClients } from "../../lib/clientsStore";
import { formatDate, formatDateTime, formatNumber } from "../../lib/labels";

export default function Car2Dashboard() {
  const { user, role, token, loading, logout } = useAuth(["agent_car2"]);
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clientsById, setClientsById] = useState({});
  const [pendingMovements, setPendingMovements] = useState([]);
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
      // Pending-only query: fetches just the few documents awaiting this
      // agent's confirmation, not the whole inventory history.
      const [ordersData, clients, pendingData] = await Promise.all([
        cachedGet(apiFetch, ordersUrl(), token),
        getClients(apiFetch, token, user.uid),
        cachedGet(apiFetch, "/api/inventory/list?status=pending", token),
      ]);
      setOrders(ordersData.orders);
      setNextCursor(ordersData.nextCursor);
      setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
      setPendingMovements(pendingData.docs);
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

  const grouped = useMemo(() => {
    return visible.reduce((acc, order) => {
      const key = order.deliveryDate ? formatDate(order.deliveryDate) : "غير محدد";
      acc[key] = acc[key] || [];
      acc[key].push(order);
      return acc;
    }, {});
  }, [visible]);

  useLiveRefresh(token, ["orders_car2", "inventory"], () => {
    invalidate("/api/orders/list");
    invalidate("/api/inventory");
    fetchAll();
  });

  const today = useMemo(() => todayStats(orders), [orders]);
  const inbox = [
    ...pendingMovements.map((d) => ({
      key: d.id,
      href: `/inventory/${d.id}`,
      icon: d.type === "offloading" ? "box" : "truck",
      tone: "warn",
      title: `${TYPE_LABELS[d.type] || d.type} بانتظار تأكيدك`,
      meta: `${previewNames(d.items)} · ${formatDateTime(d.createdAt)}`,
      cta: "أكّد",
    })),
  ];

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <TodayHeader
          title="مبيعات تجزئة"
          subtitle="خط أسبوعي ثابت"
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
            {Object.keys(grouped).length === 0 && (
              <p className="text-muted text-sm bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد فواتير مطابقة.</p>
            )}

            {Object.entries(grouped).map(([date, group]) => (
              <div key={date} className="mb-5">
                <h3 className="text-xs font-semibold text-muted mb-2 px-1">{date}</h3>
                <div className="space-y-2">
                  {group.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      name={clientsById[order.clientId]?.name}
                      location={clientsById[order.clientId]?.location}
                      onStatusChange={updateStatus}
                      canCancel={!order.locked}
                    />
                  ))}
                </div>
              </div>
            ))}

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
