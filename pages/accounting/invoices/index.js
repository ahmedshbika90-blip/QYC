import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import Icon from "../../../components/Icon";
import PeriodTabs, { periodStartISO } from "../../../components/PeriodTabs";
import FilterPanel from "../../../components/FilterPanel";
import FilterChips from "../../../components/FilterChips";
import PaymentBadge, { PAYMENT_FILTERS } from "../../../components/PaymentBadge";
import { PageLoading, SkeletonRows, Spinner } from "../../../components/Loading";
import { apiFetch } from "../../../lib/apiFetch";
import { cachedGet } from "../../../lib/apiCache";
import { useLiveRefresh } from "../../../lib/useLiveRefresh";
import { formatDateTime, formatNumber, shortCode, ROUTE_LABELS_SHORT } from "../../../lib/labels";
import { ROUTES } from "../../../lib/roles";

// The accountant's home: invoices of every route with what has been paid on
// each. Tap one to record or review its payments.
export default function AccountingInvoices() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [period, setPeriod] = useState(30);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [route, setRoute] = useState("");
  const [pay, setPay] = useState("");
  const [q, setQ] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  function url(cursor) {
    const p = new URLSearchParams();
    p.set("from", dateFrom || periodStartISO(period));
    if (dateTo) p.set("to", dateTo);
    if (route) p.set("route", route);
    if (pay) p.set("pay", pay);
    if (cursor) p.set("cursor", cursor);
    return `/api/accounting/invoices?${p}`;
  }

  async function load() {
    setFetching(true);
    setError("");
    try {
      const d = await cachedGet(apiFetch, url(), token, { ttl: 15000 });
      setInvoices(d.invoices);
      setNextCursor(d.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }
  async function loadMore() {
    setMore(true);
    try {
      const d = await cachedGet(apiFetch, url(nextCursor), token, { ttl: 15000 });
      setInvoices((list) => [...list, ...d.invoices]);
      setNextCursor(d.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setMore(false);
    }
  }

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period, dateFrom, dateTo, route, pay]);
  useLiveRefresh(token, ["orders_car1", "orders_car2", "payments"], load);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return invoices;
    return invoices.filter((i) =>
      [i.client?.name, i.client?.storeName, String(i.clientId), shortCode(i.id)].some((v) => (v || "").toLowerCase().includes(s))
    );
  }, [invoices, q]);

  const totals = useMemo(() => {
    const live = shown.filter((i) => i.status !== "cancelled");
    const t = live.reduce((a, i) => a + i.payment.total, 0);
    const p = live.reduce((a, i) => a + i.payment.paid, 0);
    return { total: t, paid: p, remaining: Math.max(0, t - p), count: live.length };
  }, [shown]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <h1 className="font-display text-2xl font-bold text-ink">الفواتير والمدفوعات</h1>
        <p className="text-sm text-muted mt-1 mb-4">المدفوعات تظهر لك وحدك ولا يراها أي دور آخر.</p>

        <PeriodTabs value={dateFrom ? null : period} onChange={(d) => { setDateFrom(""); setDateTo(""); setPeriod(d); }} />

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[["إجمالي الفواتير", totals.total], ["المدفوع", totals.paid], ["المتبقي", totals.remaining]].map(([label, v]) => (
            <div key={label} className="bg-white rounded-2xl shadow px-3 py-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="num font-bold text-ink mt-1 text-sm sm:text-base break-words">{formatNumber(v)}</p>
            </div>
          ))}
        </div>

        <div className="relative mb-3">
          <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العميل أو رقم الفاتورة..." className="h-11 w-full rounded-xl border border-line bg-white ps-10 pe-3 text-base" />
        </div>

        <FilterPanel dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo} extraActiveCount={[route, pay].filter(Boolean).length}>
          <FilterChips label="حالة الدفع" value={pay} onChange={setPay} options={PAYMENT_FILTERS} />
          <FilterChips label="المسار" value={route} onChange={setRoute} options={ROUTES.map((r) => [r, ROUTE_LABELS_SHORT[r] || r])} />
        </FilterPanel>

        {error && (
          <div role="alert" className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button type="button" onClick={load} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={6} />
        ) : shown.length === 0 ? (
          <p className="text-muted">لا توجد فواتير في هذه الفترة.</p>
        ) : (
          <>
            <ul className="bg-white rounded-2xl shadow divide-y divide-line">
              {shown.map((i) => (
                <li key={i.id}>
                  <Link href={`/accounting/invoices/${encodeURIComponent(i.id)}`} className="flex items-start justify-between gap-3 px-4 py-3.5 active:bg-surface-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{i.client?.name || `عميل ${i.clientId}`}</p>
                      <p className="text-xs text-muted mt-0.5">
                        <span className="num">{shortCode(i.id)}</span> · {ROUTE_LABELS_SHORT[i.route] || i.route} · {formatDateTime(i.createdAt)}
                      </p>
                      <div className="mt-1.5"><PaymentBadge status={i.payment.status} /></div>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="num font-bold text-ink">{formatNumber(i.payment.total)}</p>
                      {i.payment.paid > 0 && <p className="num text-xs text-green-700 mt-0.5">مدفوع {formatNumber(i.payment.paid)}</p>}
                      {i.payment.remaining > 0 && i.status !== "cancelled" && <p className="num text-xs text-amber-700 mt-0.5">متبقٍ {formatNumber(i.payment.remaining)}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {nextCursor && (
              <button type="button" onClick={loadMore} disabled={more} className="mt-3 w-full bg-white rounded-xl shadow h-11 text-sm text-ink-soft flex items-center justify-center gap-2 disabled:opacity-50">
                {more && <Spinner className="w-4 h-4" />}
                تحميل المزيد
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
