import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import StatusTabs from "../../components/StatusTabs";
import PeriodTabs, { periodStartISO } from "../../components/PeriodTabs";
import FilterPanel from "../../components/FilterPanel";
import OrderCard from "../../components/OrderCard";
import QuickActions from "../../components/QuickActions";
import InventoryDocCard from "../../components/InventoryDocCard";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { getClients } from "../../lib/clientsStore";
import { formatDateTime } from "../../lib/labels";

export default function Car1Dashboard() {
  const { user, role, token, loading, logout } = useAuth(["agent_car1"]);
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clientsById, setClientsById] = useState({});
  const [pendingMovements, setPendingMovements] = useState([]);
  const [toDecideCount, setToDecideCount] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("active");
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [storeClass, setStoreClass] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [period, setPeriod] = useState(7); // days; ignored when a custom date range is set

  // Refetches whenever the date range changes — the range is now sent to
  // the server (not just filtered client-side after the fact), since
  // that's what actually bounds how much gets read from Firestore.
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
      setToDecideCount(toDecideData.requests.length);
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

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">مبيعات جملة</h1>

        <QuickActions
          actions={[
            { href: "/place-order", label: "فاتورة جديدة" },
            { href: "/register-client", label: "إضافة عميل" },
          ]}
        />

        {toDecideCount > 0 && (
          <Link
            href="/documents"
            className="block mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3"
          >
            <p className="text-sm font-semibold text-amber-800">
              لديك {toDecideCount} {toDecideCount === 1 ? "أمر شحن" : "أوامر شحن"} من مبيعات التجزئة بانتظار موافقتك ←
            </p>
          </Link>
        )}

        {pendingMovements.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-amber-700 mb-2">
              بانتظار تأكيدك ({pendingMovements.length})
            </p>
            <div className="bg-white rounded-lg shadow divide-y border border-amber-200">
              {pendingMovements.map((d) => (
                <InventoryDocCard key={d.id} doc={d} />
              ))}
            </div>
          </div>
        )}

        <PeriodTabs
          value={dateFrom || dateTo ? null : period}
          onChange={(days) => {
            setPeriod(days);
            setDateFrom("");
            setDateTo("");
          }}
        />

        <div className="mb-3">
          <StatusTabs value={statusFilter} onChange={setStatusFilter} counts={counts} />
        </div>

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

        {(nameQuery || locationQuery || storeClass) && nextCursor && (
          <p className="text-xs text-amber-600 mb-3">
            البحث يشمل الفواتير المحمّلة فقط — اضغط "تحميل المزيد" أو حدد فترة لنتائج أشمل.
          </p>
        )}

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="space-y-2">
            {visible.length === 0 && <p className="text-gray-400">لا توجد فواتير مطابقة.</p>}
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
            {nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full bg-white rounded-lg shadow text-sm text-gray-600 h-11 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingMore && <Spinner className="w-4 h-4" />}
                {loadingMore ? "جارٍ التحميل..." : "تحميل المزيد"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
