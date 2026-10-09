import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import Icon from "../components/Icon";
import SuccessToast from "../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { useRequestId } from "../lib/useRequestId";
import { formatNumber, formatDateTime, invoiceNo } from "../lib/labels";

// رد مبلغ لعميل — after a refund, an invoice can hold credit (the client paid
// more than its new total). The agent picks those invoices and asks the
// accountant to give the money back; the accountant approves it.
const STATUS = { pending: ["بانتظار المحاسب", "bg-amber-100 text-amber-900"], approved: ["تم رد المبلغ", "bg-green-100 text-green-800"], rejected: ["مرفوض", "bg-red-100 text-red-800"] };

export default function MoneyReturn() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  const [cands, setCands] = useState(null);
  const [mine, setMine] = useState(null);
  const [picked, setPicked] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const rid = useRequestId();
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const h = { headers: { Authorization: `Bearer ${token}` } };
      const [a, b] = await Promise.all([apiFetch("/api/money-returns?candidates=1", h).then((r) => r.json()), apiFetch("/api/money-returns", h).then((r) => r.json())]);
      setCands(a.invoices || []);
      setMine(b.requests || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);
  const ids = Object.keys(picked).filter((k) => picked[k]);
  const total = (cands || []).filter((c) => picked[c.orderId]).reduce((a, c) => a + c.credit, 0);

  async function send() {
    setError("");
    if (!ids.length) return setError("اختر فاتورة واحدة على الأقل");
    const body = { orderIds: ids, note };
    setBusy(true);
    try {
      const res = await apiFetch("/api/money-returns", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, requestId: rid.idFor(body) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      rid.reset();
      setPicked({});
      setNote("");
      setToast("أُرسل الطلب إلى المحاسب");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="w-full max-w-2xl mx-auto px-3 sm:px-6 pt-4 pb-10 flex flex-col gap-5">
        <Link href="/documents" className="self-start h-11 px-2 rounded-xl text-ink font-semibold flex items-center gap-1.5 hover:bg-surface-2">
          <Icon name="chevronRight" size={20} className="rtl-flip" />
          المستندات
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">رد مبلغ لعميل</h1>
          <p className="text-ink-soft mt-1">فواتير عليها مبلغ زائد بعد مرتجع (دفع العميل أكثر من قيمتها الجديدة). اخترها وأرسل الطلب إلى المحاسب.</p>
        </div>
        {error && <p role="alert" className="text-red-700 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        {!cands ? (
          <SkeletonRows count={3} />
        ) : cands.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد فواتير عليها مبلغ زائد.</p>
        ) : (
          <section className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {cands.map((c) => (
                <li key={c.orderId}>
                  <label className={`flex items-start gap-3 rounded-2xl border-2 p-4 bg-white cursor-pointer ${picked[c.orderId] ? "border-accent" : "border-line"}`}>
                    <input type="checkbox" checked={!!picked[c.orderId]} onChange={(e) => setPicked((p) => ({ ...p, [c.orderId]: e.target.checked }))} className="mt-1 w-6 h-6 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-ink break-words">{c.clientName || `عميل ${c.clientId}`}</span>
                      <span className="block text-ink-soft">
                        فاتورة <span className="num">{invoiceNo({ number: c.number, id: c.orderId })}</span> · مدفوع <span className="num">{formatNumber(c.paid)}</span> · قيمتها الآن <span className="num">{formatNumber(c.total)}</span>
                      </span>
                    </span>
                    <span className="text-end shrink-0">
                      <span className="block text-sm text-ink-soft">يُرد</span>
                      <span className="block text-lg font-bold text-blue-700 num">{formatNumber(c.credit)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="flex flex-col gap-1.5 font-semibold text-ink-soft">
              ملاحظة للمحاسب (اختياري)
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="w-full border border-line rounded-xl px-3 h-12 text-base bg-white" />
            </label>
            <button type="button" onClick={send} disabled={busy || !ids.length} className="h-14 rounded-2xl bg-accent text-on-accent font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-40">
              {busy && <Spinner className="w-5 h-5" />}
              إرسال طلب رد <span className="num">{formatNumber(total)}</span>
            </button>
          </section>
        )}
        {mine && mine.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-bold text-ink">طلباتي السابقة</h2>
            <ul className="bg-white rounded-2xl shadow divide-y divide-line">
              {mine.map((r) => (
                <li key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink break-words">{r.items.map((i) => i.clientName).filter(Boolean).join("، ")}</span>
                    <span className="block text-sm text-ink-soft">{formatDateTime(r.requestedAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num font-bold">{formatNumber(r.total)}</span>
                    <span className={`text-sm font-bold rounded-full px-3 py-1 ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
