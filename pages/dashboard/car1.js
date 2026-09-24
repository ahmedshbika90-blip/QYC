import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

const STATUS_OPTIONS = ["pending", "contacted", "confirmed", "processing", "delivered", "cancelled"];

export default function Car1Dashboard() {
  const { role, token, loading, logout } = useAuth(["agent_car1"]);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">Car 1 — New Orders</h1>
        <p className="text-sm text-gray-500 mb-6">
          Orders come in as clients place them. Contact each client to arrange delivery timing.
        </p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-3">
          {orders.length === 0 && <p className="text-gray-400">No orders yet.</p>}
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  <p className="font-medium text-gray-800">Client #{order.clientId}</p>
                  <p className="text-sm text-gray-500">
                    {order.items.map((it) => `${it.name} x${it.qty}`).join(", ")}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Total: {order.total ?? "—"} · Placed: {new Date(order.createdAt).toLocaleString()}
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
