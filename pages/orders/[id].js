import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { STATUS_LABELS, formatDate, formatDateTime } from "../../lib/labels";

const STATUS_OPTIONS = ["pending", "delivered", "cancelled"];

export default function OrderDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [order, setOrder] = useState(null);
  const [notes, setNotes] = useState("");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function fetchOrder() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrder(data);
      setNotes(data.notes || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function updateStatus(status) {
    try {
      const res = await apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchOrder();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || fetching || !order) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">
                طلب رقم <span className="tabular-ltr">{order.id}</span>
              </h1>
              <p className="text-sm text-gray-500">
                العميل <span className="tabular-ltr">#{order.clientId}</span> — {order.client?.name} ({order.client?.storeName})
              </p>
              <p className="text-xs text-gray-400">{order.client?.location}</p>
              {order.client?.phone && (
                <div className="flex gap-4 mt-2">
                  <a
                    href={`tel:${order.client.phone}`}
                    className="text-sm text-blue-600 min-h-[44px] flex items-center"
                  >
                    اتصال {order.client.phone}
                  </a>
                  {order.client.whatsapp && (
                    <a
                      href={`https://wa.me/${order.client.whatsapp.replace(/[^\d]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 min-h-[44px] flex items-center"
                    >
                      واتساب
                    </a>
                  )}
                </div>
              )}
            </div>
            <select
              value={order.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="border rounded-lg px-3 h-11 text-base self-start"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          {/* Card list instead of a table — a table squeezes unreadably on
              phone width, this stays legible and touch-friendly. */}
          <div className="border rounded-lg divide-y mb-4">
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-base text-gray-800 truncate">{it.name}</p>
                  <p className="text-sm text-gray-400">
                    {it.qty} {it.unit || ""} × {it.price}
                  </p>
                </div>
                <p className="text-base font-medium text-gray-800 shrink-0">
                  {it.subtotal ?? it.price * it.qty}
                </p>
              </div>
            ))}
          </div>

          <div className="text-end font-semibold text-gray-800 mb-4 text-base">
            الإجمالي: {order.total ?? "—"}
          </div>

          <div className="text-sm text-gray-500 mb-4 space-y-0.5">
            {order.deliveryDate ? (
              <p>تاريخ التسليم: {formatDate(order.deliveryDate)}</p>
            ) : (
              <p>حسب الطلب — تواصل مع العميل لتحديد الموعد.</p>
            )}
            <p>تاريخ الطلب: {formatDateTime(order.createdAt)}</p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">ملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-base"
              placeholder="أضف أي ملاحظات حول هذا الطلب..."
            />
            {saving && <p className="text-xs text-gray-400 mt-1">جارٍ الحفظ...</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
