import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import StatusTabs from "../../components/StatusTabs";
import FilterPanel from "../../components/FilterPanel";
import OrderCard from "../../components/OrderCard";
import QuickActions from "../../components/QuickActions";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDateTime } from "../../lib/labels";

export default function Car1Dashboard() {
  const { role, token, loading, logout } = useAuth(["agent_car1"]);
  const [orders, setOrders] = useState([]);
  const [clientsById, setClientsById] = useState({});
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
  }, [clientsById, locationQuery, dateFrom, dateTo]);

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

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">السيارة ١</h1>

        <QuickActions
          actions={[
            { href: "/place-order", label: "فاتورة جديدة" },
            { href: "/register-client", label: "إضافة عميل" },
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
                subtitle={formatDateTime(order.createdAt)}
                onStatusChange={updateStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
