import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import StatusTabs from "../../components/StatusTabs";
import FilterPanel from "../../components/FilterPanel";
import OrderCard from "../../components/OrderCard";
import QuickActions from "../../components/QuickActions";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDate } from "../../lib/labels";

export default function SupervisorDashboard() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
  const [orders, setOrders] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [routeFilter, setRouteFilter] = useState("all");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("active");
  const [locationQuery, setLocationQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchAll() {
    setFetching(true);
    setError("");
    try {
      const [ordersRes, clientsRes] = await Promise.all([
        apiFetch("/api/orders/list", { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch("/api/clients/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const ordersData = await ordersRes.json();
      const clientsData = await clientsRes.json();
      if (!ordersRes.ok) throw new Error(ordersData.error);
      if (!clientsRes.ok) throw new Error(clientsData.error);
      setOrders(ordersData.orders);
      setClientsById(Object.fromEntries(clientsData.clients.map((c) => [c.id, c])));
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
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
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  }

  const matchesFilters = useMemo(() => {
    return (order) => {
      if (routeFilter !== "all" && order.route !== routeFilter) return false;
      if (locationQuery) {
        const location = clientsById[order.clientId]?.location || "";
        if (!location.toLowerCase().includes(locationQuery.toLowerCase())) return false;
      }
      if (dateFrom && new Date(order.createdAt) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(order.createdAt) > to) return false;
      }
      return true;
    };
  }, [clientsById, routeFilter, locationQuery, dateFrom, dateTo]);

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

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="flex justify-between items-center mb-3 gap-3">
          <h1 className="text-xl font-semibold text-gray-800">المشرف</h1>
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="border rounded-lg px-3 h-10 text-sm"
          >
            <option value="all">كل المسارات</option>
            <option value="car1">السيارة ١</option>
            <option value="car2">السيارة ٢</option>
          </select>
        </div>

        <QuickActions
          actions={[
            { href: "/reports/sales", label: "تقرير المبيعات" },
            { href: "/products", label: "الأسعار والمنتجات" },
          ]}
        />

        <div className="mb-3">
          <StatusTabs value={statusFilter} onChange={setStatusFilter} counts={counts} />
        </div>

        <FilterPanel
          locationQuery={locationQuery}
          onLocationChange={setLocationQuery}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
        />

        <p className="text-sm text-gray-500 mb-3">
          {visible.length} فاتورة — الإجمالي {totalRevenue.toFixed(2)} (باستثناء الملغاة)
        </p>

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
                location={clientsById[order.clientId]?.location}
                badge={
                  <span className="text-xs font-normal text-gray-400 ms-2">
                    {order.route === "car1" ? "السيارة ١" : "السيارة ٢"}
                  </span>
                }
                subtitle={order.deliveryDate ? `التسليم: ${formatDate(order.deliveryDate)}` : null}
                onStatusChange={updateStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
