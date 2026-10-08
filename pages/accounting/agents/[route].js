import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import BackButton from "../../../components/BackButton";
import Icon from "../../../components/Icon";
import DateFields from "../../../components/DateFields";
import FilterChips from "../../../components/FilterChips";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, Stat, ErrorLine, MarginValue, LogRow, agentName, ROUTE_LABEL, defaultPeriod, STATUS } from "../../../components/accounting/parts";

// One agent (van): what he owes, and his invoice logs day by day — tap a
// day to record his payment and split it between the clients.
export default function AgentDetail() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const { route } = useRouter().query;
  const [p, setP] = useState(defaultPeriod);
  const [status, setStatus] = useState("");
  const { data, error, reload } = useApi(token, route ? `/api/accounting/logs?route=${route}&from=${p.from}&to=${p.to}` : null);
  const people = data?.agents?.[route] || [];
  const logs = useMemo(() => (data?.logs || []).filter((l) => !status || l.status === status), [data, status]);
  if (loading) return <PageLoading />;
  const t = data?.totals;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 sm:px-8 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <BackButton />
          <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">{agentName(people, route)}</h1>
              <p className="text-sm text-ink-soft">{ROUTE_LABEL[route] || route} — سجلات الفواتير اليومية</p>
            </div>
            <Link href={`/accounting/reports?route=${route}`} className="h-11 px-4 rounded-xl border-2 border-line bg-white text-ink font-semibold flex items-center gap-2">
              <Icon name="file" size={18} />
              تقرير المندوب
            </Link>
          </div>
        </div>
        <DateFields from={p.from} to={p.to} onFrom={(from) => setP((x) => ({ ...x, from }))} onTo={(to) => setP((x) => ({ ...x, to }))} />
        <ErrorLine error={error} onRetry={reload} />
        {t && (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="فواتير الفترة" value={<Money value={t.total} />} sub={`${t.invoices} فاتورة في ${t.logs} سجل`} />
            <Stat label="المتبقي في الفترة" value={<Money value={t.remaining} />} tone={t.remaining > 0 ? "text-red-700" : "text-green-700"} />
            <Stat label="المدفوع" value={<Money value={t.paid} />} />
            <Stat label="بانتظار التوزيع" value={<Money value={t.toDistribute} />} tone={t.toDistribute > 0 ? "text-amber-700" : "text-ink"} />
            <div className="col-span-2"><Stat label="هامش التشغيل في الفترة" value={<MarginValue t={t} />} tone={t.margin < 0 ? "text-red-700" : "text-green-700"} /></div>
          </div>
        )}
        <FilterChips label="الحالة" value={status} onChange={setStatus} options={["unpaid", "partial", "paid"].map((s) => [s, STATUS[s][0]])} />
        {!data ? (
          <SkeletonRows count={5} />
        ) : logs.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد سجلات في هذه الفترة.</p>
        ) : (
          <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
            {logs.map((l) => <LogRow key={l.id} log={l} people={people} showAgent={false} />)}
          </ul>
        )}
      </main>
    </div>
  );
}
