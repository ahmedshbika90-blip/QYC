import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import SupervisorDashboard, { DashboardSkeleton, DateRange, Section, TrendChart } from "../../components/SupervisorDashboard";
import { PageLoading } from "../../components/Loading";
import Icon from "../../components/Icon";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { buildTrend, rangeText, todayYmd, V } from "../../lib/dashboardView";

// The supervisor's home: a summary of operations for a chosen range of days.
// Reading order: what period this is → how sales are trending → the headline
// numbers → money → per item → customers → stock.
// The invoice list that used to live here is at /invoices.
export default function SupervisorHome() {
  const { role, token, loading, logout } = useAuth(["manager"]);
  const [range, setRange] = useState(() => ({ from: todayYmd(), to: todayYmd() }));
  const [unit, setUnit] = useState("qty");
  const [data, setData] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("day");
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [pending, setPending] = useState(0);

  async function loadSummary(r = range) {
    setFetching(true);
    try {
      setData(await cachedGet(apiFetch, `/api/dashboard/summary?from=${r.from}&to=${r.to}`, token));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }
  async function loadTrend(k = kind) {
    setTrendLoading(true);
    try {
      setTrend(buildTrend(await cachedGet(apiFetch, `/api/dashboard/trend?bucket=${k}`, token)));
    } catch (err) {
      setError(err.message);
    } finally {
      setTrendLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadSummary(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, range.from, range.to]);
  useEffect(() => {
    if (token) loadTrend(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kind]);
  useEffect(() => {
    if (!token) return;
    cachedGet(apiFetch, "/api/requests/list?status=pending", token)
      .then((d) => setPending((d.requests || []).length))
      .catch(() => {});
  }, [token]);

  useLiveRefresh(token, ["orders_car1", "orders_car2", "inventory", "transfers"], () => {
    invalidate("/api/dashboard");
    invalidate("/api/requests");
    loadSummary(range);
    loadTrend(kind);
  });

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="dash max-w-[1320px] mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-12 md:pb-16 flex flex-col gap-10 md:gap-12">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="text-sm text-muted m-0">{data ? rangeText(data.period) : " "}</p>
            <h1 className="font-display text-[28px] md:text-[32px] leading-tight font-bold text-ink mt-1">ملخص العمليات</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {pending > 0 && (
              <Link href="/requests" className="h-11 px-4 rounded-xl flex items-center gap-2 text-sm font-bold" style={{ background: V("rs"), color: V("r") }}>
                <span className="num min-w-[22px] h-[22px] px-1.5 rounded-full text-xs flex items-center justify-center" style={{ background: V("r"), color: V("r-i") }}>{pending}</span>
                {pending === 1 ? "طلب بانتظار قرارك" : "طلبات بانتظار قرارك"}
                <Icon name="chevronLeft" size={16} />
              </Link>
            )}
            <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "rgb(var(--gray-100))", color: "rgb(var(--gray-800))" }}>
            <span className="flex items-center gap-2"><Icon name="alert" size={18} />{error}</span>
            <button type="button" onClick={() => { loadSummary(range); loadTrend(kind); }} className="font-semibold underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        <Section id="d0" title="تطور المبيعات" hint="عدد الوحدات المباعة عبر الزمن. مرّر المؤشر على المنحنى لرؤية تفاصيل أي نقطة.">
          <TrendChart trend={trend} kind={kind} onKind={setKind} loading={trendLoading} />
        </Section>

        {!data ? (
          error ? null : <DashboardSkeleton />
        ) : (
          <div className={fetching ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={fetching}>
            <SupervisorDashboard data={data} unit={unit} onUnit={setUnit} />
          </div>
        )}
      </main>
    </div>
  );
}
