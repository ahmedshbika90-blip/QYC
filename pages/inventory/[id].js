import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { shareElementAsPdf } from "../../lib/sharePdf";
import { formatDateTime } from "../../lib/labels";

const TYPE_LABELS = {
  received: "استلام بضاعة",
  loading: "تحميل",
  offloading: "تفريغ",
};

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

export default function InventoryDocDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [doc, setDoc] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [costPrices, setCostPrices] = useState({}); // productId -> string
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeBox, setShowDisputeBox] = useState(false);
  const [acting, setActing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const docRef = useRef(null);

  useEffect(() => {
    if (!token || !id) return;
    fetchDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function fetchDoc() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDoc(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleApprove() {
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "approve", costPrices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/inventory");
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!confirm("رفض هذا المستند؟ لن يُضاف إلى رصيد المخزن.")) return;
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "reject" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/inventory");
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleConfirmMovement() {
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}/confirm`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "confirm" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/inventory");
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleDisputeMovement() {
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}/confirm`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "dispute", disputeReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/inventory");
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleCancelMovement() {
    if (!confirm("إلغاء هذه الحركة؟ لن ينتقل أي رصيد.")) return;
    setActing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}/confirm`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/inventory");
      fetchDoc();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  }

  useLiveRefresh(token, ["inventory"], fetchDoc);

  async function shareDoc() {
    setSharing(true);
    setError("");
    try {
      const label = TYPE_LABELS[doc.type] || doc.type;
      await shareElementAsPdf(docRef.current, { fileName: `${label}.pdf`, title: label });
    } catch {
      setError("تعذر إنشاء ملف المستند للمشاركة. حاول مرة أخرى.");
    } finally {
      setSharing(false);
    }
  }

  if (loading || fetching) return <PageLoading />;

  if (error && !doc) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-red-600 text-sm">{error}</p>
      </div>
    );
  }
  if (!doc) return null;

  const canReviewReceived = role === "supervisor" && doc.type === "received" && doc.status === "pending";
  const isMovement = doc.type === "loading" || doc.type === "offloading";
  const canConfirmMovement =
    isMovement && doc.status === "pending" && ROLE_TO_ROUTE[role] === doc.route;
  const canCancelMovement =
    role === "supervisor" && isMovement && ["pending", "disputed"].includes(doc.status);

  const seqLabel = { 1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع", 5: "الخامس" };
  const seqText =
    isMovement && doc.dailySeq
      ? `${doc.type === "loading" ? "التحميل" : "التفريغ"} ${seqLabel[doc.dailySeq] || `رقم ${doc.dailySeq}`} اليوم`
      : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-5 sm:p-6">
          <div className="flex justify-end mb-2 no-pdf">
            <button
              onClick={shareDoc}
              disabled={sharing}
              className="text-sm bg-gray-900 text-white rounded-lg px-4 min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            >
              {sharing && <Spinner className="w-4 h-4" />}
              {sharing ? "جارٍ التجهيز..." : "مشاركة"}
            </button>
          </div>

          <div ref={docRef} className="bg-white">
          <div className="flex justify-between items-start gap-2 mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">
                {TYPE_LABELS[doc.type] || doc.type}
                {doc.route && (
                  <span className="text-sm font-normal text-gray-400 ms-2">
                    {doc.route === "car1" ? "السيارة ١" : "السيارة ٢"}
                  </span>
                )}
              </h1>
              {isMovement && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {doc.type === "loading" ? "من المخزن إلى السيارة" : "من السيارة إلى المخزن"}
                </p>
              )}
              {seqText && <p className="text-xs text-gray-500 mt-0.5 font-medium">{seqText}</p>}
              <p className="text-xs text-gray-400 mt-1">{formatDateTime(doc.createdAt)}</p>
            </div>
            <span
              className={`text-sm px-3 h-9 flex items-center rounded-lg shrink-0 ${
                doc.status === "confirmed"
                  ? "bg-green-50 text-green-700"
                  : doc.status === "rejected" || doc.status === "cancelled"
                  ? "bg-gray-100 text-gray-500"
                  : doc.status === "disputed"
                  ? "bg-red-50 text-red-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {doc.status === "confirmed"
                ? "مؤكدة"
                : doc.status === "rejected"
                ? "مرفوضة"
                : doc.status === "cancelled"
                ? "ملغاة"
                : doc.status === "disputed"
                ? "متنازع عليها"
                : "بانتظار التأكيد"}
            </span>
          </div>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <div className="border rounded-lg divide-y">
            {doc.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
                <p className="text-base text-gray-800">{it.name}</p>
                <div className="text-end">
                  <p className="text-base font-medium text-gray-800">
                    {it.qty} {it.unit || ""}
                  </p>
                  {it.costPrice != null && (
                    <p className="text-xs text-gray-400">سعر المورد للوحدة: {it.costPrice}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {doc.warehouseKeeperNote && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">ملاحظة أمين المخزن</p>
              <p className="text-base text-gray-700">{doc.warehouseKeeperNote}</p>
            </div>
          )}

          {doc.status === "disputed" && doc.disputeReason && (
            <div className="mt-4 bg-red-50 rounded-lg p-3">
              <p className="text-sm text-red-600 mb-1">سبب النزاع</p>
              <p className="text-base text-red-700">{doc.disputeReason}</p>
            </div>
          )}

          </div>

          {/* Goods received approval — supervisor only */}
          {canReviewReceived && (
            <div className="mt-6 border-t pt-4 no-pdf">
              <p className="text-sm text-gray-600 mb-3">
                أدخل سعر المورد للوحدة قبل الاعتماد (اختياري لكل منتج):
              </p>
              <div className="space-y-2 mb-4">
                {doc.items.map((it) => (
                  <div key={it.productId} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-700">{it.name}</p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPrices[it.productId] ?? ""}
                      onChange={(e) =>
                        setCostPrices((prev) => ({ ...prev, [it.productId]: e.target.value }))
                      }
                      placeholder="سعر المورد للوحدة"
                      className="w-40 border rounded-lg px-3 h-10 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="flex-1 bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {acting && <Spinner className="w-4 h-4" />}
                  اعتماد
                </button>
                <button
                  onClick={handleReject}
                  disabled={acting}
                  className="text-base text-red-600 bg-red-50 active:bg-red-100 rounded-lg px-4 h-12"
                >
                  رفض
                </button>
              </div>
            </div>
          )}

          {/* Loading/offloading confirmation — the matching car agent only */}
          {canConfirmMovement && (
            <div className="mt-6 border-t pt-4 no-pdf">
              <p className="text-sm text-gray-600 mb-3">
                تأكد من مطابقة الكميات أعلاه لما استلمته/سلّمته فعليًا.
              </p>
              {!showDisputeBox ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmMovement}
                    disabled={acting}
                    className="flex-1 bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acting && <Spinner className="w-4 h-4" />}
                    تأكيد
                  </button>
                  <button
                    onClick={() => setShowDisputeBox(true)}
                    disabled={acting}
                    className="text-base text-red-600 bg-red-50 active:bg-red-100 rounded-lg px-4 h-12"
                  >
                    نزاع
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={2}
                    placeholder="اشرح سبب عدم مطابقة الكميات..."
                    className="w-full border rounded-lg px-3 py-2 text-base"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDisputeMovement}
                      disabled={acting}
                      className="flex-1 bg-red-600 text-white rounded-lg h-12 text-base font-medium active:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {acting && <Spinner className="w-4 h-4" />}
                      إرسال النزاع
                    </button>
                    <button
                      onClick={() => setShowDisputeBox(false)}
                      className="text-base text-gray-500 px-4 h-12"
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supervisor can cancel a stuck pending/disputed movement */}
          {canCancelMovement && (
            <div className="mt-6 border-t pt-4 no-pdf">
              <button
                onClick={handleCancelMovement}
                disabled={acting}
                className="text-base text-red-600 bg-red-50 active:bg-red-100 rounded-lg px-4 h-12 w-full"
              >
                إلغاء الحركة
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
