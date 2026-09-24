import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { STATUS_LABELS, formatDate } from "../../lib/labels";

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

  const grouped = orders.reduce((acc, order) => {
    const key = order.deliveryDate ? formatDate(order.deliveryDate) : "غير محدد";
    acc[key] = acc[key] || [];
    acc[key].push(order);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">السيارة ٢ — الخط الأسبوعي</h1>
        <p className="text-sm text-gray-500 mb-6">
          الطلبات مرتبة حسب تاريخ التسليم الثابت.
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
          <>
            {Object.keys(grouped).length === 0 && <p className="text-gray-400">لا توجد طلبات بعد.</p>}

            {Object.entries(grouped).map(([date, group]) => (
              <div key={date} className="mb-6">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">{date}</h2>
                <div className="space-y-3">
                  {group.map((order) => (
                    <div key={order.id} className="bg-white rounded-lg shadow p-4">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                        <Link href={`/orders/${order.id}`} className="hover:underline">
                          <p className="font-medium text-gray-800">
                            العميل <span className="tabular-ltr">#{order.clientId}</span>
                          </p>
                          <p className="text-sm text-gray-500">
                            {order.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">الإجمالي: {order.total ?? "—"}</p>
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
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
