import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

const STATUS_OPTIONS = ["pending", "contacted", "confirmed", "processing", "delivered", "cancelled"];

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
    try {
      const res = await fetch(`/api/orders/${id}`, {
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
      const res = await fetch(`/api/orders/${id}/status`, {
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
      const res = await fetch(`/api/orders/${id}/status`, {
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

  if (loading || fetching || !order) return <p className="p-8">Loading...</p>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Order #{order.id}</h1>
              <p className="text-sm text-gray-500">
                Client #{order.clientId} — {order.client?.name} ({order.client?.storeName})
              </p>
              <p className="text-xs text-gray-400">{order.client?.location}</p>
              {order.client?.phone && (
                <div className="flex gap-3 mt-2">
                  <a
                    href={`tel:${order.client.phone}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Call {order.client.phone}
                  </a>
                  {order.client.whatsapp && (
                    <a
                      href={`https://wa.me/${order.client.whatsapp.replace(/[^\d]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 hover:underline"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
            <select
              value={order.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="text-left text-gray-400 border-b">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-gray-800">{it.name}</td>
                  <td className="py-2 text-right text-gray-600">
                    {it.qty} {it.unit || ""}
                  </td>
                  <td className="py-2 text-right text-gray-600">{it.price}</td>
                  <td className="py-2 text-right text-gray-800">{it.subtotal ?? it.price * it.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-right font-semibold text-gray-800 mb-4">
            Total: {order.total ?? "—"}
          </div>

          <div className="text-sm text-gray-500 mb-4">
            {order.deliveryDate ? (
              <p>Delivery date: {new Date(order.deliveryDate).toDateString()}</p>
            ) : (
              <p>On-demand — contact client to arrange timing.</p>
            )}
            <p>Placed: {new Date(order.createdAt).toLocaleString()}</p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Add any notes about this order..."
            />
            {saving && <p className="text-xs text-gray-400 mt-1">Saving...</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
