import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
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
import { formatDateTime, invoiceNo } from "../../../lib/labels";
import { useApi, Money, Stat, ErrorLine, MarginValue, LogStatus, PaidBar, agentName, money, weekday, todayYmd } from "../../../components/accounting/parts";

// One invoice log (سجل فواتير YYYY-MM-DD): one agent's invoices of one day.
//   1. إضافة دفعة — what the agent handed over for this day
//   2. تسجيل ما دفعه كل عميل — the accountant types each client's amount
//      (nothing is filled in automatically)
//   3. العملاء — every client in the log with their invoices
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

/** Group a log's invoices by client. */
function byClient(invoices) {
  const map = new Map();
  for (const i of invoices) {
    const k = String(i.clientId || i.id);
    if (!map.has(k)) map.set(k, { id: k, name: i.clientName || `عميل ${i.clientId}`, storeName: i.storeName, location: i.location, deliveryRoute: i.deliveryRoute, phone: i.phone, invoices: [] });
    map.get(k).invoices.push(i);
  }
  return [...map.values()].map((c) => ({
    ...c,
    total: round2(c.invoices.reduce((a, i) => a + (i.status === "cancelled" ? 0 : i.total), 0)),
    paid: round2(c.invoices.reduce((a, i) => a + i.paid, 0)),
    remaining: round2(c.invoices.reduce((a, i) => a + i.remaining, 0)),
  }));
}

/**
 * One sheet for a payment on the log: its details (new payment only) and
 * the amount each invoice received, typed by the accountant. "حفظ" works
 * only when the amounts use the whole payment — until then nothing is saved.
 */
function PaymentSheet({ token, logId, payment, clients, onSaved, onClose }) {
  const isNew = !payment;
  const [f, setF] = useState({ ref: "", bank: BANKS[0].id, amount: "", date: todayYmd(), note: "" });
  const [alloc, setAlloc] = useState(() => Object.fromEntries(Object.entries(payment?.allocations || {}).map(([k, v]) => [k, String(v)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [similar, setSimilar] = useState(null);
  const rid = useRequestId();
  const amount = isNew ? Number(f.amount) || 0 : payment.amount;
  const room = (i) => round2(i.remaining + (payment?.allocations?.[i.id] || 0));
  const sum = round2(Object.values(alloc).reduce((a, v) => a + (Number(v) || 0), 0));
  const left = round2(amount - sum);
  const over = clients.flatMap((c) => c.invoices.map((i) => ({ c, i }))).find(({ i }) => (Number(alloc[i.id]) || 0) > room(i) + 1e-9);
  const detailsOk = !isNew || (f.ref.trim() && amount > 0);
  const complete = amount > 0 && left === 0 && !over;
  const setField = (k, v) => {
    if (k === "ref" || k === "bank") setSimilar(null);
    setF((x) => ({ ...x, [k]: v }));
  };
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function save(confirmSimilar = false) {
    setError("");
    if (!detailsOk) return setError(f.ref.trim() ? "أدخل مبلغ الدفعة" : "أدخل رقم العملية");
    if (!complete) return setError(over ? `المبلغ أكبر من المتبقي على فاتورة ${over.c.name}` : "وزّع كامل مبلغ الدفعة على الفواتير أولًا");
    setBusy(true);
    try {
      const body = isNew
        ? { action: "pay", ...f, allocations: alloc, requestId: rid.idFor({ ...f, alloc }), ...(confirmSimilar ? { confirmSimilar: true } : {}) }
        : { action: "allocate", paymentId: payment.id, allocations: alloc };
      const data = await post(token, logId, body);
      if (isNew) rid.reset();
      clearRefCache();
      onSaved(data, isNew);
    } catch (err) {
      if (err.data?.needsConfirm) setSimilar(err.data.similar);
      else {
        setError(err.message);
        if (isNew && !err.isNetworkError) rid.reset();
      }
    } finally {
      setBusy(false);
    }
  }

  const label = "flex flex-col gap-1.5 font-semibold text-ink-soft min-w-0";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-canvas w-full sm:max-w-2xl h-[94dvh] sm:h-auto sm:max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden">
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pay-title" className="font-display text-xl font-bold text-ink">{isNew ? "دفعة جديدة لهذا السجل" : "تعديل ما دفعه كل عميل"}</h2>
            {!isNew && (
              <p className="text-ink-soft break-words">
                دفعة <Money value={payment.amount} className="font-bold text-ink" /> · <span className="num" dir="ltr">{payment.ref}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-[44px] h-[44px] shrink-0 rounded-xl flex items-center justify-center hover:bg-surface-2">
            <Icon name="x" size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
          {isNew && (
            <section className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-4">
              <h3 className="font-bold text-ink text-lg">١. بيانات الدفعة</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className={label}>
                  المبلغ
                  <NumericInput value={f.amount} onChange={(v) => setField("amount", v)} className={`${field} text-end text-lg font-bold`} required />
                </label>
                <label className={label}>
                  البنك
                  <select value={f.bank} onChange={(e) => setField("bank", e.target.value)} className={field}>
                    {BANKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </label>
                <label className={label}>
                  رقم العملية
                  <input inputMode="numeric" dir="ltr" value={f.ref} onChange={(e) => setField("ref", e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, ""))} maxLength={11} className={`${field} text-start tabular-ltr`} required />
                </label>
                <label className={label}>
                  تاريخ التحويل
                  <input type="date" max={todayYmd()} value={f.date} onChange={(e) => setField("date", e.target.value)} className={field} required />
                </label>
              </div>
              <label className={label}>
                ملاحظة (اختياري)
                <input value={f.note} onChange={(e) => setField("note", e.target.value)} maxLength={200} className={field} />
              </label>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="font-bold text-ink text-lg px-1">{isNew ? "٢. ما دفعه كل عميل" : "ما دفعه كل عميل"}</h3>
            <p className="text-ink-soft px-1">اكتب المبلغ الذي دفعه كل عميل من هذه الدفعة. لا تُحفظ الدفعة حتى يُوزَّع مبلغها كاملًا.</p>
            {clients.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink text-lg break-words">{c.name}</p>
                  {c.storeName && <p className="text-ink-soft break-words">{c.storeName}</p>}
                </div>
                {c.invoices.map((i) => {
                  const cancelled = i.status === "cancelled" || i.status === "cancelledPaid";
                  const tooMuch = (Number(alloc[i.id]) || 0) > room(i) + 1e-9;
                  return (
                    <div key={i.id} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-2 sm:items-center border-t border-line pt-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink break-words">فاتورة <span className="num">{invoiceNo(i)}</span></p>
                        <p className={`text-sm ${tooMuch ? "text-red-700 font-bold" : "text-ink-soft"}`}>
                          {cancelled ? "فاتورة ملغاة" : <>المتبقي عليها <Money value={room(i)} className="font-bold" /></>}
                        </p>
                      </div>
                      <NumericInput
                        value={alloc[i.id] || ""}
                        onChange={(v) => setAlloc((a) => ({ ...a, [i.id]: v }))}
                        disabled={cancelled && !alloc[i.id]}
                        placeholder="0"
                        className={`${field} text-end text-lg font-bold ${tooMuch ? "border-red-600" : ""}`}
                        aria-label={`ما دفعه ${c.name} — فاتورة ${invoiceNo(i)}`}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>

        <div className="bg-white border-t border-line px-4 sm:px-6 py-3 flex flex-col gap-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className={`rounded-xl px-4 py-3 font-bold flex flex-wrap justify-between gap-2 ${amount <= 0 ? "bg-surface-2 text-ink-soft" : left < 0 || over ? "bg-red-50 text-red-800" : left > 0 ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"}`}>
            <span>موزَّع <span className="num">{money(sum)}</span> من <span className="num">{money(amount)}</span></span>
            <span>{amount <= 0 ? "أدخل مبلغ الدفعة" : left > 0 ? <>باقٍ للتوزيع <span className="num">{money(left)}</span></> : left < 0 ? <>زيادة <span className="num">{money(-left)}</span></> : over ? "مبلغ أكبر من المتبقي على فاتورة" : "جاهزة للحفظ"}</span>
          </div>
          {similar && (
            <div role="alertdialog" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 flex flex-col gap-2">
              <p className="font-bold text-ink">آخر 4 أرقام (<span className="num" dir="ltr">{f.ref.slice(-4)}</span>) تطابق دفعة مسجلة من قبل:</p>
              <ul className="bg-white rounded-xl divide-y divide-line text-sm">
                {similar.map((m) => (
                  <li key={`${m.bank}-${m.ref}`} className="px-3 py-2 flex flex-wrap justify-between gap-2">
                    <span className="break-words">{m.kind === "log" ? <>سجل فواتير <span className="num">{m.day}</span></> : m.clientName || "فاتورة"} · {m.bankLabel} · <span className="num" dir="ltr">{m.ref}</span></span>
                    <span className="num font-bold">{money(m.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSimilar(null)} className="h-11 rounded-xl border-2 border-line bg-white font-semibold">مراجعة الرقم</button>
                <button type="button" disabled={busy} onClick={() => save(true)} className="h-11 rounded-xl bg-solid-amber text-snow font-semibold">اعتماد الدفعة</button>
              </div>
            </div>
          )}
          <ErrorLine error={error} />
          {!similar && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className="h-12 rounded-xl border-2 border-line font-semibold text-ink">إلغاء</button>
              <button type="button" onClick={() => save()} disabled={busy || !complete || !detailsOk} className="h-12 rounded-xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                {busy && <Spinner className="w-4 h-4" />}
                حفظ الدفعة
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LogPage() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const { id } = useRouter().query;
  const { data, error, reload, setData } = useApi(token, id ? `/api/accounting/logs/${encodeURIComponent(id)}` : null);
  const [sheet, setSheet] = useState(null); // "new" | a payment being re-split
  const [toast, setToast] = useState("");
  const active = useMemo(() => (data?.payments || []).filter((p) => p.status === "active"), [data]);
  const voided = useMemo(() => (data?.payments || []).filter((p) => p.status !== "active"), [data]);
  const clients = useMemo(() => byClient(data?.invoices || []), [data]);

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
      window.alert(err.message);
    }
  }

  if (loading) return <PageLoading />;
  const log = data?.log;
  const editing = sheet && sheet !== "new" ? active.find((p) => p.id === sheet) : null;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      {(sheet === "new" || editing) && (
        <PaymentSheet
          token={token}
          logId={id}
          payment={editing}
          clients={clients}
          onClose={() => setSheet(null)}
          onSaved={(next, isNew) => {
            apply(next, isNew ? "تم حفظ الدفعة وتوزيعها" : "تم حفظ التوزيع");
            setSheet(null);
          }}
        />
      )}
      <main className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-4 pb-10 flex flex-col gap-5">
        <Link href="/accounting/logs" className="self-start h-11 px-2 rounded-xl text-ink font-semibold flex items-center gap-1.5 hover:bg-surface-2">
          <Icon name="chevronRight" size={20} className="rtl-flip" />
          كل السجلات
        </Link>
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <section className="bg-white rounded-3xl shadow p-4 sm:p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink break-words">
                    سجل فواتير <span className="num" dir="ltr">{log.day}</span>
                  </h1>
                  <p className="text-ink-soft text-lg break-words">
                    {weekday(log.day)} · {agentName(data.people, log.route)}
                  </p>
                </div>
                <LogStatus status={log.status} />
              </div>
              <PaidBar paid={log.paid} total={log.total} />
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <Stat label="قيمة السجل" value={<Money value={log.total} />} sub={`${log.invoices} فاتورة · ${clients.length} عميل`} />
                <Stat label="المدفوع" value={<Money value={log.paid} />} tone="text-green-700" />
                <Stat label="المتبقي" value={<Money value={log.remaining} />} tone={log.remaining > 0 ? "text-red-700" : "text-ink"} sub={log.credit > 0 ? `مدفوع زيادة ${money(log.credit)}` : undefined} />
                <Stat label="هامش التشغيل" value={<MarginValue t={log} />} tone={log.margin < 0 ? "text-red-700" : "text-ink"} />
              </div>
            </section>

            <button type="button" onClick={() => setSheet("new")} className="h-14 rounded-2xl bg-accent text-on-accent font-bold text-lg flex items-center justify-center gap-2 shadow">
              <Icon name="plus" size={24} />
              إضافة دفعة لهذا السجل
            </button>

            {active.length > 0 && (
              <section aria-labelledby="pays-title" className="flex flex-col gap-3">
                <h2 id="pays-title" className="font-display text-xl font-bold text-ink">دفعات السجل</h2>
                {active.map((p) => {
                  const left = round2(p.amount - (p.allocatedTotal || 0));
                  return (
                    <div key={p.id} className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display text-2xl font-bold text-ink"><Money value={p.amount} /></p>
                          <p className="text-ink-soft break-words">
                            {p.bankLabel} · <span className="num" dir="ltr">{p.ref}</span> · <span className="num">{p.date}</span>
                          </p>
                          {p.note && <p className="text-ink-soft break-words">{p.note}</p>}
                        </div>
                        {left > 0 ? (
                          <span className="rounded-full bg-amber-100 text-amber-900 font-bold px-3 py-1">غير مكتملة — أكمل التوزيع</span>
                        ) : (
                          <span className="rounded-full bg-green-100 text-green-800 font-bold px-3 py-1">مكتملة</span>
                        )}
                      </div>
                      <PaidBar paid={p.allocatedTotal || 0} total={p.amount} />
                      <p className="text-ink-soft">
                        مسجل للعملاء <Money value={p.allocatedTotal || 0} className="font-bold text-ink" />
                        {left > 0 && <> · باقٍ <Money value={left} className="font-bold text-amber-800" /></>}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button type="button" onClick={() => setSheet(p.id)} className="h-12 rounded-xl bg-accent-soft text-accent-ink font-bold">
                          {left > 0 ? "إكمال التوزيع" : "تعديل ما دفعه كل عميل"}
                        </button>
                        <button type="button" onClick={() => voidPayment(p)} className="h-12 rounded-xl border-2 border-line text-red-700 font-semibold">إلغاء الدفعة</button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            <section aria-labelledby="clients-title" className="flex flex-col gap-3">
              <h2 id="clients-title" className="font-display text-xl font-bold text-ink">العملاء في هذا السجل</h2>
              {clients.length === 0 ? (
                <p className="text-ink-soft bg-white rounded-3xl shadow px-4 py-8 text-center">لا توجد فواتير في هذا اليوم.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {clients.map((c) => (
                    <div key={c.id} className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-bold text-ink text-lg break-words">{c.name}</p>
                        <p className="text-ink-soft break-words">{[c.storeName, c.deliveryRoute, c.location].filter(Boolean).join(" · ")}</p>
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="num text-accent-ink font-semibold" dir="ltr">{c.phone}</a>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center bg-surface-2 rounded-2xl p-3">
                        <div><p className="text-sm text-ink-soft">القيمة</p><p className="font-bold"><Money value={c.total} /></p></div>
                        <div><p className="text-sm text-ink-soft">المدفوع</p><p className="font-bold text-green-700"><Money value={c.paid} /></p></div>
                        <div><p className="text-sm text-ink-soft">المتبقي</p><p className={`font-bold ${c.remaining > 0 ? "text-red-700" : ""}`}><Money value={c.remaining} /></p></div>
                      </div>
                      <ul className="divide-y divide-line">
                        {c.invoices.map((i) => (
                          <li key={i.id}>
                            <Link href={`/accounting/invoices/${encodeURIComponent(i.id)}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-surface-2 rounded-xl px-1">
                              <span className="min-w-0">
                                <span className="block font-semibold text-ink num break-words">{invoiceNo(i)}</span>
                                <span className="block text-sm text-ink-soft">{formatDateTime(i.createdAt)}</span>
                              </span>
                              <span className="flex items-center gap-2">
                                <Money value={i.total} className="font-bold" />
                                <PaymentBadge status={i.status} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {voided.length > 0 && (
              <details className="bg-white rounded-2xl shadow px-4">
                <summary className="cursor-pointer text-ink-soft font-semibold min-h-[48px] flex items-center">دفعات ملغاة ({voided.length})</summary>
                <ul className="divide-y divide-line pb-2">
                  {voided.map((p) => (
                    <li key={p.id} className="py-2.5 flex flex-wrap justify-between gap-2 text-ink-soft">
                      <span className="break-words"><span className="num" dir="ltr">{p.ref}</span> · {p.voidReason}</span>
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
