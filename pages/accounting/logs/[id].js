import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import BackButton from "../../../components/BackButton";
import Icon from "../../../components/Icon";
import NumericInput from "../../../components/NumericInput";
import PaymentBadge from "../../../components/PaymentBadge";
import SuccessToast from "../../../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../../../components/Loading";
import { apiFetch } from "../../../lib/apiFetch";
import { invalidate } from "../../../lib/apiCache";
import { clearRefCache } from "../../../lib/refSearchCache";
import { useRequestId } from "../../../lib/useRequestId";
import { BANKS } from "../../../lib/paymentsShared";
import { formatDateTime } from "../../../lib/labels";
import { useApi, Money, Stat, ErrorLine, MarginValue, LogStatus, agentName, day, money } from "../../../components/accounting/parts";

import { TIME_ZONE } from "../../../lib/companyConfig";
// One invoice log (سجل الفواتير): one agent's invoices of one day.
//   1. تسجيل دفعة — what the agent paid for this day (reference, bank, amount)
//   2. توزيع — split it between the clients' invoices (who paid what)
//   3. the invoices, each with paid / remaining
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";

async function post(token, logId, body) {
  const res = await apiFetch(`/api/accounting/logs/${encodeURIComponent(logId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "حدث خطأ"), { data });
  return data;
}

function PayForm({ token, logId, onSaved, onCancel }) {
  const empty = { ref: "", bank: BANKS[0].id, amount: "", date: todayYmd(), note: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [similar, setSimilar] = useState(null);
  const rid = useRequestId();
  const set = (k, v) => {
    if (k === "ref" || k === "bank") setSimilar(null);
    setF((x) => ({ ...x, [k]: v }));
  };
  async function save(e, confirmSimilar = false) {
    e?.preventDefault();
    setError("");
    if (!f.ref.trim()) return setError("أدخل رقم العملية");
    if (!(Number(f.amount) > 0)) return setError("أدخل المبلغ");
    setBusy(true);
    try {
      const data = await post(token, logId, { action: "pay", ...f, requestId: rid.idFor(f), ...(confirmSimilar ? { confirmSimilar: true } : {}) });
      rid.reset();
      clearRefCache();
      onSaved(data);
    } catch (err) {
      if (err.data?.needsConfirm) setSimilar(err.data.similar);
      else {
        setError(err.message);
        if (!err.isNetworkError) rid.reset();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-ink">تسجيل دفعة من المندوب</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
          رقم العملية
          <input inputMode="numeric" dir="ltr" value={f.ref} onChange={(e) => set("ref", e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, ""))} maxLength={11} className={`${field} text-start tabular-ltr`} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
          البنك
          <select value={f.bank} onChange={(e) => set("bank", e.target.value)} className={field}>
            {BANKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
          المبلغ
          <NumericInput value={f.amount} onChange={(v) => set("amount", v)} className={`${field} text-end`} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
          تاريخ التحويل
          <input type="date" max={todayYmd()} value={f.date} onChange={(e) => set("date", e.target.value)} className={field} required />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
        ملاحظة (اختياري)
        <input value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={200} className={field} />
      </label>
      {error && <ErrorLine error={error} />}
      {similar ? (
        <div role="alertdialog" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 flex flex-col gap-3">
          <p className="font-bold text-ink">آخر 4 أرقام (<span className="num" dir="ltr">{f.ref.slice(-4)}</span>) تطابق دفعة مسجلة من قبل</p>
          <ul className="bg-white rounded-xl divide-y divide-line text-sm">
            {similar.map((m) => (
              <li key={`${m.bank}-${m.ref}`} className="px-3 py-2 flex justify-between gap-2">
                <span>
                  {m.kind === "log" ? <>سجل {day(m.day)}</> : m.clientName || "فاتورة"} · {m.bankLabel} · <span className="num" dir="ltr">{m.ref}</span>
                </span>
                <span className="num font-bold">{money(m.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSimilar(null)} className="h-12 rounded-xl border border-line bg-white font-semibold">مراجعة الرقم</button>
            <button type="button" disabled={busy} onClick={() => save(null, true)} className="h-12 rounded-xl bg-solid-amber text-snow font-semibold">اعتماد الدفعة</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="h-12 rounded-xl border border-line font-semibold text-ink">إلغاء</button>
          <button type="submit" disabled={busy} className="h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Spinner className="w-4 h-4" />}
            تسجيل الدفعة
          </button>
        </div>
      )}
    </form>
  );
}

function Distribute({ token, logId, payment, invoices, onSaved, onClose }) {
  const start = Object.fromEntries(invoices.map((i) => [i.id, payment.allocations?.[i.id] ? String(payment.allocations[i.id]) : ""]));
  const [alloc, setAlloc] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What each invoice could still take from THIS payment.
  const room = (i) => Math.round((i.remaining + (payment.allocations?.[i.id] || 0)) * 100) / 100;
  const sum = Object.values(alloc).reduce((a, v) => a + (Number(v) || 0), 0);
  const left = Math.round((payment.amount - sum) * 100) / 100;
  function auto() {
    let rest = payment.amount;
    const next = {};
    for (const i of invoices) {
      if (i.status === "cancelled" || i.status === "cancelledPaid") continue;
      const take = Math.min(room(i), rest);
      next[i.id] = take > 0 ? String(take) : "";
      rest = Math.round((rest - Math.max(0, take)) * 100) / 100;
    }
    setAlloc(next);
  }
  async function save() {
    setError("");
    if (left < 0) return setError("مجموع التوزيع أكبر من مبلغ الدفعة");
    const over = invoices.find((i) => (Number(alloc[i.id]) || 0) > room(i) + 1e-9);
    if (over) return setError(`المبلغ أكبر من المتبقي على فاتورة ${over.clientName || ""}`);
    setBusy(true);
    try {
      onSaved(await post(token, logId, { action: "allocate", paymentId: payment.id, allocations: alloc }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 border-t border-line pt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-ink">توزيع الدفعة على العملاء</p>
        <button type="button" onClick={auto} className="h-10 px-3 rounded-xl bg-surface-2 text-ink font-semibold text-sm">توزيع تلقائي</button>
      </div>
      <ul className="flex flex-col gap-2">
        {invoices.map((i) => {
          const cancelled = i.status === "cancelled" || i.status === "cancelledPaid";
          return (
            <li key={i.id} className="grid grid-cols-[1fr_8.5rem] gap-2 items-center">
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{i.clientName || `عميل ${i.clientId}`}</p>
                <p className="text-xs text-ink-soft">
                  {cancelled ? "فاتورة ملغاة" : <>يقبل حتى <span className="num font-semibold">{money(room(i))}</span></>}
                </p>
              </div>
              <NumericInput value={alloc[i.id] || ""} onChange={(v) => setAlloc((a) => ({ ...a, [i.id]: v }))} disabled={cancelled && !alloc[i.id]} placeholder="0" className={`${field} text-end`} aria-label={`المبلغ من ${i.clientName || "العميل"}`} />
            </li>
          );
        })}
      </ul>
      <div className={`rounded-xl px-3 py-2.5 text-sm font-semibold flex justify-between ${left < 0 ? "bg-red-50 text-red-700" : left > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
        <span>موزَّع <span className="num">{money(sum)}</span> من <span className="num">{money(payment.amount)}</span></span>
        <span>{left > 0 ? <>باقٍ <span className="num">{money(left)}</span></> : left < 0 ? <>زيادة <span className="num">{money(-left)}</span></> : "مكتمل"}</span>
      </div>
      {error && <ErrorLine error={error} />}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-line font-semibold text-ink">إغلاق</button>
        <button type="button" onClick={save} disabled={busy} className="h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Spinner className="w-4 h-4" />}
          حفظ التوزيع
        </button>
      </div>
    </div>
  );
}

export default function LogPage() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const { id } = useRouter().query;
  const url = id ? `/api/accounting/logs/${encodeURIComponent(id)}` : null;
  const { data, error, reload, setData } = useApi(token, url);
  const [paying, setPaying] = useState(false);
  const [open, setOpen] = useState(null); // payment id being distributed
  const [toast, setToast] = useState("");
  const active = useMemo(() => (data?.payments || []).filter((p) => p.status === "active"), [data]);
  const voided = useMemo(() => (data?.payments || []).filter((p) => p.status !== "active"), [data]);

  function apply(next, message) {
    invalidate("/api/accounting");
    setData((d) => ({ ...d, ...next }));
    setToast(message);
  }
  async function voidPayment(p) {
    const reason = window.prompt("سبب إلغاء الدفعة؟");
    if (!reason) return;
    try {
      apply(await post(token, id, { action: "void", paymentId: p.id, reason }), "تم إلغاء الدفعة");
      clearRefCache();
    } catch (err) {
      setToast("");
      window.alert(err.message);
    }
  }

  if (loading) return <PageLoading />;
  const log = data?.log;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="max-w-3xl mx-auto px-4 sm:px-8 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <BackButton />
          <div className="flex items-start justify-between gap-3 mt-1">
            <div>
              <p className="text-sm text-ink-soft">سجل الفواتير</p>
              <h1 className="font-display text-2xl font-bold text-ink">{log ? day(log.day) : "…"}</h1>
              {log && (
                <p className="text-ink-soft">
                  <Link href={`/accounting/agents/${log.route}`} className="font-semibold text-accent-ink underline-offset-2 hover:underline">{agentName(data.people, log.route)}</Link>
                </p>
              )}
            </div>
            {log && <LogStatus status={log.status} />}
          </div>
        </div>
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="إجمالي الفواتير" value={<Money value={log.total} />} sub={`${log.invoices} فاتورة`} />
              <Stat label="المتبقي" value={<Money value={log.remaining} />} tone={log.remaining > 0 ? "text-red-700" : "text-green-700"} sub={log.credit > 0 ? `رصيد زائد ${money(log.credit)}` : undefined} />
              <Stat label="المدفوع" value={<Money value={log.paid} />} />
              <Stat label="بانتظار التوزيع" value={<Money value={log.toDistribute} />} tone={log.toDistribute > 0 ? "text-amber-700" : "text-ink"} />
              <div className="col-span-2"><Stat label="هامش التشغيل لهذا اليوم" value={<MarginValue t={log} />} tone={log.margin < 0 ? "text-red-700" : "text-green-700"} /></div>
            </div>

            {paying ? (
              <PayForm
                token={token}
                logId={id}
                onCancel={() => setPaying(false)}
                onSaved={(next) => {
                  apply(next, "تم تسجيل الدفعة — وزّعها الآن على العملاء");
                  setPaying(false);
                  setOpen(next.payment?.id || null);
                }}
              />
            ) : (
              <button type="button" onClick={() => setPaying(true)} className="h-14 rounded-2xl bg-accent text-on-accent font-bold text-lg flex items-center justify-center gap-2 shadow">
                <Icon name="plus" size={22} />
                تسجيل دفعة من المندوب
              </button>
            )}

            {active.length > 0 && (
              <section aria-labelledby="pays-title" className="flex flex-col gap-3">
                <h2 id="pays-title" className="font-display text-lg font-bold text-ink">دفعات السجل</h2>
                {active.map((p) => {
                  const left = Math.round((p.amount - (p.allocatedTotal || 0)) * 100) / 100;
                  return (
                    <div key={p.id} className="bg-white rounded-2xl shadow p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-ink"><Money value={p.amount} /></p>
                          <p className="text-sm text-ink-soft">
                            {p.bankLabel} · <span className="num" dir="ltr">{p.ref}</span> · {day(p.date)}
                          </p>
                          {p.note && <p className="text-sm text-ink-soft mt-0.5">{p.note}</p>}
                        </div>
                        <div className="text-end shrink-0">
                          {left > 0 ? (
                            <span className="text-sm font-bold text-amber-700">باقٍ للتوزيع <Money value={left} /></span>
                          ) : (
                            <span className="text-sm font-bold text-green-700">موزَّعة بالكامل</span>
                          )}
                        </div>
                      </div>
                      {open === p.id ? (
                        <Distribute token={token} logId={id} payment={p} invoices={data.invoices} onClose={() => setOpen(null)} onSaved={(next) => { apply(next, "تم حفظ التوزيع"); setOpen(null); }} />
                      ) : (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <button type="button" onClick={() => setOpen(p.id)} className="h-11 rounded-xl bg-accent-soft text-accent-ink font-bold">توزيع</button>
                          <button type="button" onClick={() => voidPayment(p)} className="h-11 rounded-xl border border-line text-red-700 font-semibold">إلغاء الدفعة</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            <section aria-labelledby="inv-title" className="flex flex-col gap-3">
              <h2 id="inv-title" className="font-display text-lg font-bold text-ink">الفواتير في هذا السجل</h2>
              {data.invoices.length === 0 ? (
                <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد فواتير في هذا اليوم.</p>
              ) : (
                <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
                  {data.invoices.map((i) => (
                    <li key={i.id}>
                      <Link href={`/accounting/invoices/${encodeURIComponent(i.id)}`} className="flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2">
                        <div className="min-w-0">
                          <p className="font-bold text-ink truncate">{i.clientName || `عميل ${i.clientId}`}</p>
                          <p className="text-sm text-ink-soft truncate">{[i.number, i.storeName, i.deliveryRoute, formatDateTime(i.createdAt)].filter(Boolean).join(" · ")}</p>
                          <div className="mt-1"><PaymentBadge status={i.status} /></div>
                        </div>
                        <div className="text-end shrink-0">
                          <p className="font-bold text-ink"><Money value={i.total} /></p>
                          {i.paid > 0 && <p className="text-sm text-ink-soft">مدفوع <Money value={i.paid} /></p>}
                          {i.remaining > 0 && <p className="text-sm font-bold text-red-700">متبقٍ <Money value={i.remaining} /></p>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {voided.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-ink-soft font-semibold min-h-[44px] flex items-center">دفعات ملغاة ({voided.length})</summary>
                <ul className="mt-2 bg-white rounded-2xl shadow divide-y divide-line">
                  {voided.map((p) => (
                    <li key={p.id} className="px-4 py-2.5 flex justify-between gap-2 text-ink-soft">
                      <span><span className="num" dir="ltr">{p.ref}</span> · {p.voidReason}</span>
                      <span className="num line-through">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
}
