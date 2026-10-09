import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import Icon from "../../../components/Icon";
import PaymentBadge from "../../../components/PaymentBadge";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { apiFetch } from "../../../lib/apiFetch";
import { businessDay } from "../../../lib/businessDay";
import { formatDateTime, formatNumber, formatQty, invoiceNo, ROUTE_LABELS_SHORT } from "../../../lib/labels";

// One invoice for the accountant — read only. Payments are recorded on the
// invoice LOG (the agent's day) and split there; an invoice just shows the
// amounts it received and which log each came from.
async function get(token, url) {
  const res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}
const logIdOf = (o) => `${o.route}_${businessDay(new Date(o.createdAt))}`;

export default function AccountingInvoice() {
  const { id } = useRouter().query;
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [order, setOrder] = useState(null);
  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [inv, pay] = await Promise.all([get(token, `/api/accounting/invoice?id=${encodeURIComponent(id)}`), get(token, `/api/payments/${encodeURIComponent(id)}`)]);
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

  if (loading) return <PageLoading />;
  const logHref = order?.route && order?.createdAt ? `/accounting/logs/${encodeURIComponent(logIdOf(order))}` : "/accounting/logs";
  const received = (payments || []).filter((p) => !p.voided);

  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-2xl mx-auto px-3 sm:px-6 pt-4 pb-10 flex flex-col gap-5">
        <Link href={logHref} className="self-start h-11 px-2 rounded-xl text-ink font-semibold flex items-center gap-1.5 hover:bg-surface-2">
          <Icon name="chevronRight" size={20} className="rtl-flip" />
          سجل الفواتير
        </Link>
        {error && (
          <p role="alert" className="text-red-700 bg-red-50 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0 break-words">{error}</span>
            <button type="button" onClick={load} className="underline font-semibold">إعادة المحاولة</button>
          </p>
        )}
        {!order ? (
          !error && <SkeletonRows count={5} />
        ) : (
          <>
            <section className="bg-white rounded-3xl shadow p-4 sm:p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink-soft">فاتورة <span className="num font-semibold">{invoiceNo(order)}</span></p>
                  <h1 className="font-display text-2xl font-bold text-ink break-words">{client?.name || `عميل ${order.clientId}`}</h1>
                  <p className="text-ink-soft break-words">
                    {[client?.storeName, client?.deliveryRoute, ROUTE_LABELS_SHORT[order.route] || order.route, formatDateTime(order.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {summary && <PaymentBadge status={summary.status} />}
              </div>
              <ul className="divide-y divide-line border-y border-line">
                {(order.items || []).map((it, i) => (
                  <li key={i} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink min-w-0 break-words">
                      {it.name}
                      <span className="text-ink-soft"> × <span className="num">{formatQty(it.qty)}</span></span>
                      {it.freeSample && <span className="ms-2 text-sm text-green-700">عينة مجانية</span>}
                    </span>
                    <span className="num text-ink">{formatNumber(it.subtotal ?? 0)}</span>
                  </li>
                ))}
              </ul>
              {Number(order.discount) > 0 && (
                <p className="flex justify-between text-ink-soft">
                  <span>الخصم</span>
                  <span className="num">− {formatNumber(order.discount)}</span>
                </p>
              )}
              <p className="flex justify-between text-lg font-bold text-ink">
                <span>إجمالي الفاتورة</span>
                <span className="num">{formatNumber(order.total)}</span>
              </p>
            </section>

            {summary && (
              <section className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-green-50 px-4 py-3">
                  <p className="text-green-800 font-semibold">المدفوع</p>
                  <p className="num text-2xl font-bold text-ink mt-1">{formatNumber(summary.paid)}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-amber-900 font-semibold">المتبقي</p>
                  <p className="num text-2xl font-bold text-ink mt-1">{formatNumber(summary.remaining)}</p>
                </div>
              </section>
            )}

            <section aria-labelledby="paid-title" className="flex flex-col gap-3">
              <h2 id="paid-title" className="font-display text-xl font-bold text-ink">المبالغ المستلمة</h2>
              {received.length === 0 ? (
                <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-5">
                  لم يُسجَّل أي مبلغ لهذه الفاتورة بعد. تُسجَّل الدفعات على{" "}
                  <Link href={logHref} className="text-accent-ink font-semibold underline">سجل الفواتير</Link> ثم يُوزَّع المبلغ على الفواتير.
                </p>
              ) : (
                <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                  {received.map((p) => (
                    <li key={p.id} className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-ink-soft"><span className="num">{p.date}</span></span>
                        {p.logId && (
                          <Link href={`/accounting/logs/${encodeURIComponent(p.logId)}`} className="text-accent-ink font-semibold">
                            من سجل فواتير <span className="num" dir="ltr">{p.logId.split("_").pop()}</span>
                          </Link>
                        )}
                      </span>
                      <span className="num text-xl font-bold text-ink">{formatNumber(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
