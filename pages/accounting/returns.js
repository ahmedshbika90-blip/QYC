import { useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import SuccessToast from "../../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { BANKS } from "../../lib/paymentsShared";
import { formatDateTime, invoiceNo } from "../../lib/labels";
import { useApi, Money, ErrorLine, Choice, money, todayYmd, ROUTE_LABEL } from "../../components/accounting/parts";

// رد المبالغ — agents' requests to give money back to clients after a
// refund. Approving records how it was paid back (bank + reference, or
// cash); the credit then leaves the invoices and the client's balance.
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";

function Approve({ token, r, onDone }) {
  const [f, setF] = useState({ method: "bank", bank: BANKS[0].id, ref: "", date: todayYmd(), note: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function act(action) {
    setError("");
    if (action === "approve" && f.method === "bank" && !f.ref.trim()) return setError("أدخل رقم العملية");
    if (action === "reject" && !window.confirm("رفض الطلب؟")) return;
    setBusy(action);
    try {
      const res = await apiFetch("/api/money-returns", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: r.id, action, ...f }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onDone(action === "approve" ? "تم رد المبلغ" : "تم رفض الطلب");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <Choice label="طريقة الرد" value={f.method} onChange={(v) => setF((x) => ({ ...x, method: v }))} options={[["bank", "تحويل بنكي"], ["cash", "نقدًا"]]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {f.method === "bank" && (
          <>
            <label className="flex flex-col gap-1.5 font-semibold text-ink-soft">البنك
              <select value={f.bank} onChange={(e) => setF((x) => ({ ...x, bank: e.target.value }))} className={field}>{BANKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1.5 font-semibold text-ink-soft">رقم العملية
              <input inputMode="numeric" dir="ltr" value={f.ref} onChange={(e) => setF((x) => ({ ...x, ref: e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "") }))} maxLength={11} className={`${field} text-start`} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1.5 font-semibold text-ink-soft">التاريخ
          <input type="date" max={todayYmd()} value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold text-ink-soft">ملاحظة (اختياري)
          <input value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} maxLength={200} className={field} />
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" onClick={() => act("approve")} disabled={!!busy} className="h-12 rounded-xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2 sm:order-2">
          {busy === "approve" && <Spinner className="w-4 h-4" />}
          اعتماد — تم رد <span className="num">{money(r.total)}</span>
        </button>
        <button type="button" onClick={() => act("reject")} disabled={!!busy} className="h-12 rounded-xl border-2 border-line text-red-700 font-semibold sm:order-1">رفض</button>
      </div>
    </div>
  );
}

export default function Returns() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [tab, setTab] = useState("pending");
  const [toast, setToast] = useState("");
  const { data, error, reload } = useApi(token, `/api/money-returns${tab === "pending" ? "?status=pending" : ""}`);
  if (loading) return <PageLoading />;
  const list = (data?.requests || []).filter((r) => tab === "pending" || r.status !== "pending");
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="w-full max-w-3xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">رد المبالغ</h1>
          <p className="text-ink-soft mt-1">طلبات المناديب لرد مبالغ زائدة للعملاء بعد المرتجع.</p>
        </div>
        <Choice label="" value={tab} onChange={setTab} options={[["pending", "بانتظارك"], ["done", "السابقة"]]} />
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          <SkeletonRows count={4} />
        ) : list.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-3xl shadow px-4 py-10 text-center">{tab === "pending" ? "لا توجد طلبات بانتظارك." : "لا توجد طلبات سابقة."}</p>
        ) : (
          list.map((r) => (
            <section key={r.id} className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold text-ink"><Money value={r.total} /></p>
                  <p className="text-ink-soft break-words">مندوب {ROUTE_LABEL[r.route] || r.route}{r.requestedByName ? ` · ${r.requestedByName}` : ""} · {formatDateTime(r.requestedAt)}</p>
                  {r.note && <p className="text-ink-soft break-words">{r.note}</p>}
                </div>
                {r.status !== "pending" && (
                  <span className={`rounded-full px-3 py-1 font-bold ${r.status === "approved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {r.status === "approved" ? (r.method === "cash" ? "رُد نقدًا" : `رُد بتحويل ${r.ref || ""}`) : "مرفوض"}
                  </span>
                )}
              </div>
              <ul className="divide-y divide-line rounded-2xl bg-surface-2 px-3">
                {r.items.map((i) => (
                  <li key={i.orderId} className="py-2.5 flex flex-wrap justify-between gap-2">
                    <a href={`/accounting/invoices/${encodeURIComponent(i.orderId)}`} className="min-w-0 break-words">
                      <span className="font-semibold text-ink">{i.clientName || `عميل ${i.clientId}`}</span>
                      <span className="text-ink-soft"> · فاتورة <span className="num">{invoiceNo({ number: i.number, id: i.orderId })}</span></span>
                    </a>
                    <Money value={i.amount} className="font-bold" />
                  </li>
                ))}
              </ul>
              {r.status === "pending" && (
                <Approve
                  token={token}
                  r={r}
                  onDone={(m) => {
                    setToast(m);
                    invalidate("/api/money-returns");
                    invalidate("/api/accounting");
                    reload();
                  }}
                />
              )}
            </section>
          ))
        )}
      </main>
    </div>
  );
}
