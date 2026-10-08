import { useMemo, useState } from "react";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import DateFields from "../../../components/DateFields";
import FilterChips from "../../../components/FilterChips";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, Stat, ErrorLine, LogRow, agentName, defaultPeriod, STATUS } from "../../../components/accounting/parts";

// سجلات الفواتير — every agent's daily logs together, newest first.
// Filter by agent and by status (unpaid / partial / paid).
export default function Logs() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [p, setP] = useState(defaultPeriod);
  const [route, setRoute] = useState("");
  const [status, setStatus] = useState("");
  const { data, error, reload } = useApi(token, `/api/accounting/logs?from=${p.from}&to=${p.to}${route ? `&route=${route}` : ""}`);
  const logs = useMemo(() => (data?.logs || []).filter((l) => !status || l.status === status), [data, status]);
  if (loading) return <PageLoading />;
  const t = data?.totals;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 sm:px-8 pt-5 pb-10 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">سجلات الفواتير</h1>
          <p className="text-sm text-ink-soft mt-1">لكل مندوب سجل يومي بفواتيره. افتح السجل لتسجيل ما دفعه وتوزيعه على العملاء.</p>
        </div>
        <DateFields from={p.from} to={p.to} onFrom={(from) => setP((x) => ({ ...x, from }))} onTo={(to) => setP((x) => ({ ...x, to }))} />
        {data && (
          <FilterChips label="المندوب" value={route} onChange={setRoute} options={Object.entries(data.agents || {}).map(([r, people]) => [r, agentName(people, r)])} />
        )}
        <FilterChips label="الحالة" value={status} onChange={setStatus} options={["unpaid", "partial", "paid"].map((s) => [s, STATUS[s][0]])} />
        <ErrorLine error={error} onRetry={reload} />
        {t && (
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="الإجمالي" value={<Money value={t.total} />} />
            <Stat label="المدفوع" value={<Money value={t.paid} />} />
            <Stat label="المتبقي" value={<Money value={t.remaining} />} tone={t.remaining > 0 ? "text-red-700" : "text-green-700"} />
          </div>
        )}
        {!data ? (
          <SkeletonRows count={6} />
        ) : logs.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد سجلات مطابقة.</p>
        ) : (
          <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
            {logs.map((l) => <LogRow key={l.id} log={l} people={data.agents?.[l.route]} />)}
          </ul>
        )}
      </main>
    </div>
  );
}
