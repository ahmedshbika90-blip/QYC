import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import QtyStepper from "./QtyStepper";
import { Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { useRequestId } from "../lib/useRequestId";
import { formatNumber, formatDateTime } from "../lib/labels";

// مرتجع: the agent (or manager) picks how many of each line come back and
// whether they're sellable (back into the van) or damaged. The value is
// worked out from the sale prices with the invoice's discount scaled to
// the remaining lines. After 9 hours an agent's refund is a request to the
// manager, with a reason.
const round2 = (n) => Math.round(Number(n) * 100) / 100;

export default function RefundSheet({ token, order, needsRequest, onDone, onClose }) {
  const items = order.items || [];
  const [ret, setRet] = useState(() => items.map(() => ({ qty: 0, damaged: false })));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rid = useRequestId();
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Same calculation as the server (lib/refunds.js): the discount shrinks
  // with the lines that remain.
  const calc = useMemo(() => {
    const oldSub = items.reduce((a, it) => a + (Number(it.subtotal) || 0), 0);
    const newSub = items.reduce((a, it, i) => a + (Number(it.price) || 0) * (Number(it.qty) - ret[i].qty), 0);
    const disc = Number(order.discount) || 0;
    const newDisc = oldSub > 0 ? round2(disc * (newSub / oldSub)) : 0;
    const full = items.every((it, i) => ret[i].qty >= Number(it.qty));
    const newTotal = full ? 0 : round2(newSub - newDisc);
    return { value: round2((Number(order.total) || 0) - newTotal), newTotal, full, any: ret.some((r) => r.qty > 0) };
  }, [items, ret, order]);

  async function save() {
    setError("");
    if (!calc.any) return setError("اختر الأصناف المرتجعة وكمياتها");
    if (needsRequest && !reason.trim()) return setError("اكتب سبب المرتجع — سيُرسل الطلب إلى المدير");
    const lines = ret.map((r, index) => ({ index, qty: r.qty, damaged: r.damaged })).filter((l) => l.qty > 0);
    const body = { lines, reason: reason.trim() };
    setBusy(true);
    try {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, requestId: rid.idFor(body) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر حفظ المرتجع");
      rid.reset();
      onDone(d);
    } catch (err) {
      setError(err.message);
      if (!err.isNetworkError) rid.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="refund-title" className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-canvas w-full sm:max-w-xl h-[94dvh] sm:h-auto sm:max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden">
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="refund-title" className="font-display text-xl font-bold text-ink">مرتجع</h2>
            <p className="text-ink-soft">اختر الكمية المرتجعة من كل صنف، وهل هي صالحة للبيع أم تالفة.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-[44px] h-[44px] shrink-0 rounded-xl flex items-center justify-center hover:bg-surface-2">
            <Icon name="x" size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 flex flex-col gap-3">
          {items.map((it, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-ink break-words">{it.name}{it.freeSample && <span className="ms-2 text-sm text-green-700">عينة مجانية</span>}</p>
                  <p className="text-ink-soft">في الفاتورة <span className="num">{it.qty}</span> {it.unit || ""} · السعر <span className="num">{formatNumber(it.price)}</span></p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <QtyStepper value={ret[i].qty} min={0} max={Number(it.qty)} onChange={(v) => setRet((r) => r.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Math.min(Number(it.qty), v)) } : x)))} />
                {ret[i].qty > 0 && (
                  <div role="radiogroup" aria-label="حالة البضاعة" className="inline-flex gap-1 p-1 rounded-xl bg-surface-2">
                    {[[false, "صالحة للبيع"], [true, "تالفة"]].map(([v, l]) => (
                      <button key={l} type="button" role="radio" aria-checked={ret[i].damaged === v} onClick={() => setRet((r) => r.map((x, j) => (j === i ? { ...x, damaged: v } : x)))} className={`h-10 px-3 rounded-lg text-sm font-semibold ${ret[i].damaged === v ? (v ? "bg-red-600 text-snow" : "bg-white text-ink shadow-sm") : "text-ink-soft"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {needsRequest && (
            <label className="flex flex-col gap-1.5 font-semibold text-ink-soft">
              سبب المرتجع (الفاتورة مقفلة — يُرسل الطلب إلى المدير)
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="w-full border border-line rounded-xl px-3 py-2 text-base bg-white" />
            </label>
          )}
        </div>
        <div className="bg-white border-t border-line px-4 sm:px-6 py-3 flex flex-col gap-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="rounded-xl bg-surface-2 px-4 py-3 flex flex-wrap justify-between gap-2 font-bold">
            <span>قيمة المرتجع <span className="num">{formatNumber(calc.value)}</span></span>
            <span className="text-ink-soft font-semibold">{calc.full ? "مرتجع كامل" : <>إجمالي الفاتورة بعده <span className="num">{formatNumber(calc.newTotal)}</span></>}</span>
          </div>
          {error && <p role="alert" className="text-red-700 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="h-12 rounded-xl border-2 border-line font-semibold text-ink">إلغاء</button>
            <button type="button" onClick={save} disabled={busy || !calc.any} className="h-12 rounded-xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy && <Spinner className="w-4 h-4" />}
              {needsRequest ? "إرسال الطلب" : "تأكيد المرتجع"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The notes on an invoice: each refund, and the full-refund state. */
export function RefundNotes({ order }) {
  if (!order.refunds?.length) return null;
  return (
    <div className="flex flex-col gap-2 mb-3">
      {order.refundStatus === "awaitingMoney" && (
        <p className="text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">مرتجع بالكامل — بانتظار رد المبلغ للعميل</p>
      )}
      {order.refunds.map((r) => (
        <div key={r.id} className="text-sm rounded-lg px-3 py-2 bg-purple-50 text-purple-900 border border-purple-200">
          <p className="font-semibold">
            {r.full ? "مرتجع كامل" : "مرتجع"} بقيمة <span className="num">{formatNumber(r.value)}</span> — {formatDateTime(r.at)}
          </p>
          <p className="mt-0.5">
            {r.lines.map((l, i) => (
              <span key={i} className="me-2">
                {l.name} × <span className="num">{l.qty}</span>{l.damaged ? " (تالف)" : ""}
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  );
}
