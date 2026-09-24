import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

const STATUS_OPTIONS = ["pending", "contacted", "confirmed", "processing", "delivered", "cancelled"];

export default function SupervisorDashboard() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
  const [orders, setOrders] = useState([]);
  const [routeFilter, setRouteFilter] = useState("all");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchOrders() {
    setFetching(true);
    try {
      const res = await fetch("/api/orders/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrders(data.orders);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function updateStatus(orderId, status) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchOrders();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading || fetching) return <p className="p-8">Loading...</p>;

  const visible = routeFilter === "all" ? orders : orders.filter((o) => o.route === routeFilter);
  const totalRevenue = visible
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (o.total || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-8">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-semibold text-gray-800">Supervisor — All Orders</h1>
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="all">All routes</option>
            <option value="car1">Car 1</option>
            <option value="car2">Car 2</option>
          </select>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          {visible.length} orders — total value {totalRevenue.toFixed(2)} (excludes cancelled)
        </p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-3">
          {visible.length === 0 && <p className="text-gray-400">No orders.</p>}
          {visible.map((order) => (
            <div key={order.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  <p className="font-medium text-gray-800">
                    Client #{order.clientId}{" "}
                    <span className="text-xs font-normal text-gray-400 uppercase ml-2">
                      {order.route}
                    </span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {order.items.map((it) => `${it.name} x${it.qty}`).join(", ")}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Total: {order.total ?? "—"}
                    {order.deliveryDate && ` · Delivery: ${new Date(order.deliveryDate).toDateString()}`}
                  </p>
                </Link>
                <select
                  value={order.status}
                  onChange={(e) => updateStatus(order.id, e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
