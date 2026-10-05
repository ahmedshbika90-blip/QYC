import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import BackButton from "../../../components/BackButton";
import Icon from "../../../components/Icon";
import SuccessToast from "../../../components/SuccessToast";
import PaymentBadge from "../../../components/PaymentBadge";
import { PageLoading, SkeletonRows, Spinner } from "../../../components/Loading";
import { apiFetch } from "../../../lib/apiFetch";
import { invalidate } from "../../../lib/apiCache";
import { useRequestId } from "../../../lib/useRequestId";
import { formatDate, formatDateTime, formatNumber, formatQty, shortCode, ROUTE_LABELS_SHORT } from "../../../lib/labels";
import { cleanMoneyInput } from "../../../lib/qty";
import { BANKS, BANK_LABELS } from "../../../lib/paymentsShared";

const field = "h-12 w-full rounded-xl border border-line bg-white px-3 text-base text-ink";
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
const digitsOnly = (v) =>
  String(v)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, 11);

async function call(token, url, body) {
  const res = await apiFetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

function AddPayment({ token, orderId, remaining, onAdded }) {
  const empty = { bank: "", ref: "", amount: "", date: todayYmd(), note: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rid = useRequestId();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const amount = Number(form.amount) || 0;
  const over = amount > remaining + 1e-9;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{1,11}$/.test(form.ref)) return setError("رقم العملية يجب أن يكون أرقامًا فقط، من 1 إلى 11 رقمًا");
    if (!form.bank) return setError("اختر البنك");
    if (!(amount > 0)) return setError("أدخل المبلغ");
    if (over) return setError("المبلغ أكبر من المتبقي على الفاتورة");
    setBusy(true);
    const payload = { ...form, amount: form.amount };
    try {
      const data = await call(token, `/api/payments/${encodeURIComponent(orderId)}`, { ...payload, requestId: rid.idFor(payload) });
      rid.reset();
      setForm({ ...empty, date: form.date });
      onAdded(data);
    } catch (err) {
      setError(err.message);
      if (!err.isNetworkError) rid.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          البنك
          <select value={form.bank} onChange={(e) => set("bank", e.target.value)} className={field} required>
            <option value="" disabled>اختر البنك</option>
            {BANKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          رقم العملية
          <input
            inputMode="numeric"
            dir="ltr"
            value={form.ref}
            onChange={(e) => set("ref", digitsOnly(e.target.value))}
            maxLength={11}
            placeholder="حتى 11 رقمًا"
            className={`${field} num text-end placeholder:text-right`}
            required
          />
          <span className="text-xs text-muted font-normal num">{form.ref.length}/11</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          المبلغ (SDG)
          <input
            inputMode="decimal"
            dir="ltr"
            value={form.amount}
            onChange={(e) => set("amount", cleanMoneyInput(e.target.value))}
            className={`${field} num text-end ${over ? "border-red-400" : ""}`}
            required
          />
          <button type="button" onClick={() => set("amount", String(remaining))} className="self-start text-xs font-semibold text-accent-ink underline">
            المتبقي كاملًا: <span className="num">{formatNumber(remaining)}</span>
          </button>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          تاريخ الدفعة
          <input type="date" max={todayYmd()} value={form.date} onChange={(e) => set("date", e.target.value)} className={field} required />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
        ملاحظة (اختياري)
        <input value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={200} className={field} />
      </label>
      <button disabled={busy} className="h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <Spinner className="w-4 h-4" /> : <Icon name="plus" size={18} />}
        تسجيل الدفعة
      </button>
    </form>
  );
}

function PaymentRow({ p, onVoid }) {
  return (
    <li className={`px-4 py-3.5 ${p.voided ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{BANK_LABELS[p.bank] || p.bank}</p>
          <p className="text-sm text-muted mt-0.5">
            رقم العملية <span className="num text-ink" dir="ltr">{p.ref}</span> · {formatDate(`${p.date}T12:00:00Z`)}
          </p>
          {p.note && <p className="text-xs text-muted mt-1">{p.note}</p>}
          <p className="text-xs text-muted mt-1">سُجّلت {formatDateTime(p.createdAt)}</p>
          {p.voided && <p className="text-xs text-red-700 mt-1">ملغاة — {p.voidReason}</p>}
        </div>
        <div className="text-end shrink-0 flex flex-col items-end gap-2">
          <p className={`num font-bold ${p.voided ? "line-through text-muted" : "text-ink"}`}>{formatNumber(p.amount)}</p>
          {!p.voided && (
            <button type="button" onClick={() => onVoid(p)} className="text-xs font-semibold text-red-700 underline">
              إلغاء الدفعة
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function AccountingInvoice() {
  const router = useRouter();
  const { id } = router.query;
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [order, setOrder] = useState(null);
  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showVoided, setShowVoided] = useState(false);

  async function load() {
    setError("");
    try {
      const [inv, pay] = await Promise.all([
        call(token, `/api/accounting/invoice?id=${encodeURIComponent(id)}`),
        call(token, `/api/payments/${encodeURIComponent(id)}`),
      ]);
      setOrder(inv.order);
      setClient(inv.client);
      setPayments(pay.payments);
      setSummary(pay.summary);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    if (token && id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function voidOne(p) {
    const reason = window.prompt(`سبب إلغاء دفعة ${formatNumber(p.amount)} (رقم العملية ${p.ref}):`);
    if (reason === null) return;
    if (!reason.trim()) return setError("اكتب سبب الإلغاء");
    try {
      await call(token, `/api/payments/${encodeURIComponent(id)}`, { action: "void", paymentId: p.id, reason });
      invalidate("/api/accounting");
      setToast("تم إلغاء الدفعة");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <PageLoading />;

  const active = (payments || []).filter((p) => !p.voided);
  const voided = (payments || []).filter((p) => p.voided);

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="max-w-2xl mx-auto px-4 pt-5 pb-8 sm:px-8 flex flex-col gap-5">
        <BackButton href="/accounting/invoices" />
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        {!order ? (
          error ? null : <SkeletonRows count={5} />
        ) : (
          <>
            <section className="bg-white rounded-2xl shadow p-5 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">فاتورة <span className="num">{shortCode(order.id)}</span></p>
                  <h1 className="font-display text-xl font-bold text-ink mt-0.5">{client?.name || `عميل ${order.clientId}`}</h1>
                  <p className="text-sm text-muted mt-0.5">
                    {client?.storeName ? `${client.storeName} · ` : ""}
                    {ROUTE_LABELS_SHORT[order.route] || order.route} · {formatDateTime(order.createdAt)}
                  </p>
                </div>
                {summary && <PaymentBadge status={summary.status} />}
              </div>
              <ul className="divide-y divide-line border-y border-line">
                {(order.items || []).map((it, i) => (
                  <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {it.name}
                      <span className="text-muted"> × <span className="num">{formatQty(it.qty)}</span></span>
                      {it.freeSample && <span className="ms-2 text-xs text-green-700">عينة مجانية</span>}
                    </span>
                    <span className="num text-ink">{formatNumber(it.subtotal ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                {Number(order.discount) > 0 && (
                  <>
                    <dt className="text-muted">الخصم</dt>
                    <dd className="num text-end">− {formatNumber(order.discount)}</dd>
                  </>
                )}
                <dt className="font-semibold text-ink">إجمالي الفاتورة</dt>
                <dd className="num text-end font-bold text-ink">{formatNumber(order.total)}</dd>
              </dl>
            </section>

            {summary && (
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-green-50 px-4 py-3">
                  <p className="text-xs text-green-700 font-semibold">المدفوع</p>
                  <p className="num text-lg font-bold text-ink mt-1">{formatNumber(summary.paid)}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-700 font-semibold">المتبقي</p>
                  <p className="num text-lg font-bold text-ink mt-1">{formatNumber(summary.remaining)}</p>
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold text-ink">المدفوعات</h2>
              {active.length === 0 ? (
                <p className="text-sm text-muted">لم تُسجَّل أي دفعة على هذه الفاتورة بعد.</p>
              ) : (
                <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                  {active.map((p) => <PaymentRow key={p.id} p={p} onVoid={voidOne} />)}
                </ul>
              )}
              {voided.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowVoided((v) => !v)} className="self-start text-sm text-muted flex items-center gap-1.5" aria-expanded={showVoided}>
                    <Icon name={showVoided ? "chevronDown" : "chevronLeft"} size={16} />
                    دفعات ملغاة (<span className="num">{voided.length}</span>)
                  </button>
                  {showVoided && (
                    <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                      {voided.map((p) => <PaymentRow key={p.id} p={p} onVoid={voidOne} />)}
                    </ul>
                  )}
                </>
              )}
            </section>

            {order.status === "cancelled" ? (
              <p className="text-sm text-muted bg-surface-2 rounded-xl px-4 py-3">هذه الفاتورة ملغاة — لا يمكن تسجيل دفعات عليها.</p>
            ) : summary && summary.remaining > 0 ? (
              <section className="bg-white rounded-2xl shadow p-5 flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold text-ink">دفعة جديدة</h2>
                <AddPayment
                  token={token}
                  orderId={order.id}
                  remaining={summary.remaining}
                  onAdded={(d) => {
                    invalidate("/api/accounting");
                    setToast(d.duplicate ? "هذه الدفعة مسجلة بالفعل" : "تم تسجيل الدفعة");
                    load();
                  }}
                />
              </section>
            ) : (
              <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 flex items-center gap-2">
                <Icon name="check" size={18} />
                الفاتورة مدفوعة بالكامل.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
