import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { STATUS_LABELS, formatDateTime } from "../../lib/labels";

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
    setError("");
    try {
      const res = await apiFetch("/api/orders/list", {
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
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
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

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">السيارة ١ — الطلبات الجديدة</h1>
        <p className="text-sm text-gray-500 mb-6">
          تصل الطلبات فور تقديم العملاء لها. تواصل مع كل عميل لتحديد موعد التسليم.
        </p>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchOrders} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="space-y-3">
            {orders.length === 0 && <p className="text-gray-400">لا توجد طلبات بعد.</p>}
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <Link href={`/orders/${order.id}`} className="hover:underline">
                    <p className="font-medium text-gray-800">
                      العميل <span className="tabular-ltr">#{order.clientId}</span>
                    </p>
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
