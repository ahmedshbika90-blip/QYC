import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import FilterChips from "../../components/FilterChips";
import StatusTabs from "../../components/StatusTabs";
import PeriodTabs, { periodStartISO } from "../../components/PeriodTabs";
import FilterPanel from "../../components/FilterPanel";
import { hasDiscount } from "../../lib/invoiceDiscount";
import OrderCard from "../../components/OrderCard";
import QuickActions from "../../components/QuickActions";
import { TodayHeader, ActionInbox, SectionTitle, todayStats } from "../../components/Today";
import Link from "next/link";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { getClients } from "../../lib/clientsStore";
import { formatDate, formatNumber } from "../../lib/labels";

export default function SupervisorDashboard() {
  const { user, role, token, loading, logout } = useAuth(["supervisor"]);
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clientsById, setClientsById] = useState({});
  const [routeFilter, setRouteFilter] = useState("all");
  const [pendingRequests, setPendingRequests] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("active");
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [storeClass, setStoreClass] = useState("");
  const [discountFilter, setDiscountFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState(""); // "" | "with" | "without"
  const [sampleFilter, setSampleFilter] = useState(""); // "" | "with" | "without" // "" | "with" | "without"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [period, setPeriod] = useState(7); // days; ignored when a custom date range is set

  useEffect(() => {
    if (!token) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dateFrom, dateTo, period, routeFilter]);

  function ordersUrl(cursor) {
    const params = new URLSearchParams();
    params.set("from", dateFrom || periodStartISO(period));
    if (dateTo) params.set("to", dateTo);
    if (routeFilter !== "all") params.set("route", routeFilter);
    if (cursor) params.set("cursor", cursor);
    return `/api/orders/list?${params.toString()}`;
  }

  async function fetchAll() {
    setFetching(true);
    setError("");
    try {
      const [ordersData, clients, pendingData] = await Promise.all([
        cachedGet(apiFetch, ordersUrl(), token),
        getClients(apiFetch, token, user.uid),
        cachedGet(apiFetch, "/api/requests/list?status=pending", token).catch(() => ({ requests: [] })),
      ]);
      setPendingRequests(pendingData.requests.length);
      setOrders(ordersData.orders);
      setNextCursor(ordersData.nextCursor);
      setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
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
      if (routeFilter !== "all" && order.route !== routeFilter) return false;
      if (nameQuery) {
        const name = clientsById[order.clientId]?.name || "";
        if (!name.toLowerCase().includes(nameQuery.toLowerCase())) return false;
      }
      if (locationQuery) {
        const location = clientsById[order.clientId]?.location || "";
        if (!location.toLowerCase().includes(locationQuery.toLowerCase())) return false;
      }
      if (storeClass && clientsById[order.clientId]?.storeClass !== storeClass) return false;
      if (discountFilter === "with" && !hasDiscount(order)) return false;
      if (discountFilter === "without" && hasDiscount(order)) return false;
      if (sampleFilter === "with" && !order.hasFreeSample) return false;
      if (sampleFilter === "without" && order.hasFreeSample) return false;
      if (priceFilter === "with" && !order.hasPriceAdjustment) return false;
      if (priceFilter === "without" && order.hasPriceAdjustment) return false;
      return true;
    };
  }, [clientsById, routeFilter, nameQuery, locationQuery, storeClass, discountFilter, sampleFilter, priceFilter]);

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

  const totalRevenue = visible
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (o.total || 0), 0);

  useLiveRefresh(token, ["orders_car1", "orders_car2", "requests"], () => {
    invalidate("/api/orders/list");
    fetchAll();
  });

  const today = useMemo(() => todayStats(orders), [orders]);
  const inbox =
    pendingRequests > 0
      ? [
          {
            key: "requests",
            href: "/requests",
            icon: "inbox",
            tone: "warn",
            title: `${pendingRequests} ${pendingRequests === 1 ? "طلب تعديل أو إلغاء" : "طلبات تعديل أو إلغاء"} بانتظار قرارك`,
            meta: "فواتير لن تتغير حتى توافق أو ترفض",
            cta: "قرّر الآن",
          },
        ]
      : [];

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-5xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <TodayHeader
          title="نظرة اليوم"
          subtitle={routeFilter === "car1" ? "مبيعات جملة" : routeFilter === "car2" ? "مبيعات تجزئة" : "كل المسارات"}
          aside={
            <FilterChips
              className="shrink-0"
              value={routeFilter === "all" ? "" : routeFilter}
              onChange={(v) => setRouteFilter(v || "all")}
              options={[["car1", "جملة"], ["car2", "تجزئة"]]}
            />
          }
          stats={[
            { label: "فواتير اليوم", value: fetching ? "…" : today.count },
            { label: "مبيعات اليوم", value: fetching ? "…" : formatNumber(today.total) },
            { label: "بانتظار قرارك", value: pendingRequests, tone: pendingRequests > 0 ? "warn" : undefined },
          ]}
        />

        <ActionInbox items={inbox} emptyText="لا توجد قرارات معلّقة" />

        <QuickActions
          actions={[
            { href: "/reports/sales", label: "تقرير المبيعات", icon: "chart" },
            { href: "/margin", label: "هامش التشغيل", icon: "percent" },
            { href: "/inventory", label: "المخزون", icon: "box" },
            { href: "/products", label: "الأسعار والمنتجات", icon: "tag" },
          ]}
        />

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
          discountFilter={discountFilter}
          onDiscountFilterChange={setDiscountFilter}
          sampleFilter={sampleFilter}
          priceFilter={priceFilter}
          onPriceFilterChange={setPriceFilter}
          onSampleFilterChange={setSampleFilter}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          />
        </div>

        {(nameQuery || locationQuery || storeClass || discountFilter || sampleFilter || priceFilter) && nextCursor && (
          <p className="text-xs text-amber-600 mb-3">
            البحث يشمل الفواتير المحمّلة فقط — اضغط "تحميل المزيد" أو حدد فترة لنتائج أشمل.
          </p>
        )}

        <p className="text-sm text-muted mb-3">
          <span className="num font-semibold text-ink">{visible.length}</span> فاتورة معروضة — الإجمالي <span className="num font-semibold text-ink tabular-ltr">{formatNumber(totalRevenue)}</span> (باستثناء الملغاة){nextCursor ? " · توجد فواتير أخرى لم تُحمَّل" : ""}
        </p>

        {error && (
          <div role="alert" className="text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="space-y-2">
            {visible.length === 0 && (
              <p className="text-muted text-sm bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد فواتير مطابقة.</p>
            )}
            {visible.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                name={clientsById[order.clientId]?.name}
                location={clientsById[order.clientId]?.location}
                edited={order.edited}
                badge={
                  <span className={`shrink-0 text-[11px] font-semibold rounded-md px-1.5 py-0.5 ${order.route === "car1" ? "bg-accent-soft text-accent-ink" : "bg-blue-100 text-blue-700"}`}>
                    {order.route === "car1" ? "جملة" : "تجزئة"}
                  </span>
                }
                subtitle={order.deliveryDate ? `التسليم: ${formatDate(order.deliveryDate)}` : null}
                onStatusChange={updateStatus}
              />
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
          </div>
        )}
      </main>
    </div>
  );
}
