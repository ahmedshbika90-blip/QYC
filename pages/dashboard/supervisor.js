import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import SupervisorDashboard, { DashboardSkeleton, PeriodMenu } from "../../components/SupervisorDashboard";
import { PageLoading } from "../../components/Loading";
import Icon from "../../components/Icon";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { rangeText } from "../../lib/dashboardView";

// The supervisor's home: a summary of the operation for a chosen period.
// The invoice list that used to live here is now at /invoices.
export default function SupervisorHome() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
  const [period, setPeriod] = useState("today");
  const [unit, setUnit] = useState("qty");
  const [data, setData] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);

  async function load(p) {
    setFetching(true);
    try {
      const d = await cachedGet(apiFetch, `/api/dashboard/summary?period=${p}`, token);
      setData(d);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (token) load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

  useEffect(() => {
    if (!token) return;
    cachedGet(apiFetch, "/api/requests/list?status=pending", token)
      .then((d) => setPending((d.requests || []).length))
      .catch(() => {});
  }, [token]);

  useLiveRefresh(token, ["orders_car1", "orders_car2", "inventory", "transfers"], () => {
    invalidate("/api/dashboard");
    invalidate("/api/requests");
    load(period);
  });

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-[1360px] mx-auto px-4 md:px-10 pt-5 md:pt-8 pb-10 md:pb-14 flex flex-col gap-9 md:gap-11">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted">{data ? rangeText(period, data.period) : " "}</div>
            <h1 className="font-display text-[34px] leading-[1.2] font-bold text-ink mt-1">لوحة العمليات</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {pending > 0 && (
              <Link href="/requests" className="h-12 px-4 rounded-2xl flex items-center gap-2 text-sm font-bold bg-amber-100 text-amber-700">
                <span className="num min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-700 text-amber-100 text-xs flex items-center justify-center">{pending}</span>
                {pending === 1 ? "طلب بانتظار قرارك" : "طلبات بانتظار قرارك"}
              </Link>
            )}
            <PeriodMenu period={period} onChange={setPeriod} />
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2"><Icon name="alert" size={18} />{error}</span>
            <button type="button" onClick={() => load(period)} className="font-semibold underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

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
