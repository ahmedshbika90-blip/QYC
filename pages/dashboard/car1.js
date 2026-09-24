import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { STATUS_LABELS, formatDateTime } from "../../lib/labels";

const STATUS_OPTIONS = ["pending", "delivered", "cancelled"];

export default function Car1Dashboard() {
  const { role, token, loading, logout } = useAuth(["agent_car1"]);
  const [orders, setOrders] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  // Filters
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

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
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
    });
  }, [orders, clientsById, locationQuery, dateFrom, dateTo]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">السيارة ١ — الطلبات الجديدة</h1>
        <p className="text-sm text-gray-500 mb-4">
          تصل الطلبات فور تقديم العملاء لها. تواصل مع كل عميل لتحديد موعد التسليم.
        </p>

        <div className="bg-white rounded-lg shadow p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            placeholder="ابحث حسب الموقع..."
            className="border rounded-lg px-3 h-11 text-base sm:col-span-1"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 h-11 text-base"
            aria-label="من تاريخ"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded-lg px-3 h-11 text-base"
            aria-label="إلى تاريخ"
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchAll} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="space-y-3">
            {filteredOrders.length === 0 && <p className="text-gray-400">لا توجد طلبات مطابقة.</p>}
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <Link href={`/orders/${order.id}`} className="hover:underline">
                    <p className="font-medium text-gray-800">
                      العميل <span className="tabular-ltr">#{order.clientId}</span>
                    </p>
                    <p className="text-xs text-gray-400">{clientsById[order.clientId]?.location}</p>
                    <p className="text-sm text-gray-500">
                      {order.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      الإجمالي: {order.total ?? "—"} · {formatDateTime(order.createdAt)}
                    </p>
                  </Link>
                  <select
                    value={order.status}
                    onChange={(e) => updateStatus(order.id, e.target.value)}
                    className="border rounded-lg px-3 h-11 text-base"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
