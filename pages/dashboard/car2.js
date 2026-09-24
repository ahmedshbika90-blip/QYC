import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

const STATUS_OPTIONS = ["pending", "contacted", "confirmed", "processing", "delivered", "cancelled"];

export default function Car2Dashboard() {
  const { role, token, loading, logout } = useAuth(["agent_car2"]);
  const [orders, setOrders] = useState([]);
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

  const grouped = orders.reduce((acc, order) => {
    const key = order.deliveryDate ? new Date(order.deliveryDate).toDateString() : "Unscheduled";
    acc[key] = acc[key] || [];
    acc[key].push(order);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">Car 2 — Weekly Route</h1>
        <p className="text-sm text-gray-500 mb-6">
          Orders are grouped by their fixed delivery date.
        </p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {Object.keys(grouped).length === 0 && <p className="text-gray-400">No orders yet.</p>}

        {Object.entries(grouped).map(([date, group]) => (
          <div key={date} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">{date}</h2>
            <div className="space-y-3">
              {group.map((order) => (
                <div key={order.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex justify-between items-start">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      <p className="font-medium text-gray-800">Client #{order.clientId}</p>
                      <p className="text-sm text-gray-500">
                        {order.items.map((it) => `${it.name} x${it.qty}`).join(", ")}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Total: {order.total ?? "—"}</p>
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
        ))}
      </div>
    </div>
  );
}
