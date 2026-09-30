import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { useRequestId } from "../../lib/useRequestId";
import { formatDateTime, formatQty } from "../../lib/labels";

// The warehouse keeper's queue of agent-submitted requests ready to
// fulfill — car1's own requests, plus car2's LOADING requests once
// approved by car1 (car2's offloading needs no such approval). Fulfilling
// a loading request creates a document still awaiting the car agent's own
// confirmation; fulfilling an offloading request finalizes and moves
// stock immediately, since the warehouse keeper is the one receiving it.
export default function ShipmentRequestQueue() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [requests, setRequests] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [qtyOverrides, setQtyOverrides] = useState({});
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [justFulfilled, setJustFulfilled] = useState(null); // { id, type }
  const requestIds = useRequestId();

  async function load() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch("/api/shipment-requests/list?status=pending_warehouse", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRequests(data.requests);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useLiveRefresh(token, ["shipmentRequests"], () => {
    invalidate("/api/shipment-requests");
    load();
  });

  function openRequest(r) {
    setOpenId(r.id);
    setNote("");
    setQtyOverrides(Object.fromEntries(r.items.map((it) => [it.productId, String(it.qty)])));
  }

  async function fulfill(r) {
    setActing(true);
    setError("");
    try {
      const items = r.items.map((it) => ({ productId: it.productId, qty: Number(qtyOverrides[it.productId]) }));
      const body = { items, note };
      const res = await apiFetch(`/api/shipment-requests/${r.id}/fulfill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, requestId: requestIds.idFor({ ...body, sourceId: r.id }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      setJustFulfilled({ id: data.id, type: r.type });
      setOpenId(null);
      invalidate("/api/inventory");
      load();
    } catch (err) {
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">طلبات بانتظار التنفيذ</h1>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {justFulfilled && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-green-700 text-sm">
              {justFulfilled.type === "offloading"
                ? "تم تسجيل مرتجع البضاعة واستلامه في المخزن — لا حاجة لتأكيد إضافي."
                : "تم إنشاء أمر الشحن — بانتظار تأكيد المندوب."}
            </p>
            <Link href={`/inventory/${justFulfilled.id}`} className="text-sm text-green-800 underline">
              فتح المستند ←
            </Link>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : requests.length === 0 ? (
          <p className="text-gray-400">لا توجد طلبات بانتظار التنفيذ.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium text-gray-800">
                      {r.type === "loading" ? "أمر شحن" : "مرتجع بضاعة"}
                      <span className="text-xs font-normal text-gray-400 ms-2">
                        {r.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة"}
                      </span>
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {r.items.map((it) => `${it.name} ×${it.qty}`).join("، ")}
                    </p>
                    {r.note && <p className="text-xs text-gray-400 mt-1">ملاحظة المندوب: {r.note}</p>}
                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(r.requestedAt)}</p>
                  </div>
                  {openId !== r.id && (
                    <button
                      onClick={() => openRequest(r)}
                      className="text-sm bg-gray-900 text-white rounded-lg px-4 h-10 shrink-0"
                    >
                      تنفيذ
                    </button>
                  )}
                </div>

                {openId === r.id && (
                  <div className="mt-4 border-t pt-4 space-y-3">
                    <p className="text-xs text-gray-500">
                      عدّل الكميات إذا اختلفت عمّا طُلب، ثم أكّد.
                      {r.type === "offloading" && " هذا يسجّلها ويستلمها في المخزن فورًا."}
                    </p>
                    <div className="space-y-2">
                      {r.items.map((it) => (
                        <div key={it.productId} className="flex items-center justify-between gap-3">
                          <p className="text-sm text-gray-700">{it.name}</p>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={qtyOverrides[it.productId] ?? ""}
                            onChange={(e) =>
                              setQtyOverrides((prev) => ({ ...prev, [it.productId]: e.target.value }))
                            }
                            className="w-24 border rounded-lg px-2 h-10 text-sm text-center"
                          />
                        </div>
                      ))}
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="ملاحظتك (اختياري)"
                      className="w-full border rounded-lg px-3 py-2 text-base"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => fulfill(r)}
                        disabled={acting}
                        className="flex-1 bg-gray-900 text-white rounded-lg h-12 text-base font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {acting && <Spinner className="w-4 h-4" />}
                        {r.type === "offloading" ? "تأكيد الاستلام" : "إرسال للتأكيد"}
                      </button>
                      <button onClick={() => setOpenId(null)} className="text-base text-gray-500 px-4 h-12">
                        تراجع
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">{formatQty(requests.length)} طلب بانتظار التنفيذ.</p>
      </div>
    </div>
  );
}
