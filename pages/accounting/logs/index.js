import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, Stat, ErrorLine, LogCard, Choice, agentName, presetPeriod, STATUS, todayYmd } from "../../../components/accounting/parts";

// سجلات الفواتير — the accountant's home. Every card is one invoice log:
// one agent's invoices of one day, its value, what's paid and what's left.
// Open a card to see the clients, add the agent's payment, and record who
// paid what. Filters: period, agent, status.
const PERIODS = [
  ["week", "هذا الأسبوع"],
  ["month", "هذا الشهر"],
  ["30", "آخر 30 يومًا"],
  ["custom", "تاريخ محدد"],
];
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";

export default function Logs() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const router = useRouter();
  const [preset, setPreset] = useState("30");
  const [p, setP] = useState(() => presetPeriod("30"));
  const [route, setRoute] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (router.query.route) setRoute(String(router.query.route));
  }, [router.query.route]);
  const { data, error, reload } = useApi(token, `/api/accounting/logs?from=${p.from}&to=${p.to}${route ? `&route=${route}` : ""}`);
  const logs = useMemo(() => (data?.logs || []).filter((l) => !status || l.status === status), [data, status]);
  const agents = Object.entries(data?.agents || {});

  function choosePreset(k) {
    setPreset(k);
    if (k !== "custom") setP(presetPeriod(k));
  }

  if (loading) return <PageLoading />;
  const t = data?.totals;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">سجلات الفواتير</h1>
          <p className="text-ink-soft mt-1">كل سجل = فواتير مندوب واحد في يوم واحد. افتح السجل لإضافة دفعة المندوب وتسجيل ما دفعه كل عميل.</p>
        </div>

        <section aria-label="التصفية" className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-4">
          <Choice label="الفترة" value={preset} onChange={choosePreset} options={PERIODS} />
          {preset === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
                من
                <input type="date" value={p.from} max={p.to} onChange={(e) => e.target.value && setP((x) => ({ ...x, from: e.target.value }))} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
                إلى
                <input type="date" value={p.to} min={p.from} max={todayYmd()} onChange={(e) => e.target.value && setP((x) => ({ ...x, to: e.target.value }))} className={field} />
              </label>
            </div>
          )}
          {agents.length > 0 && (
            <Choice label="المندوب" value={route} onChange={setRoute} options={[["", "الكل"], ...agents.map(([r, people]) => [r, agentName(people, r)])]} />
          )}
          <Choice label="الحالة" value={status} onChange={setStatus} options={[["", "الكل"], ...["unpaid", "partial", "paid"].map((s) => [s, STATUS[s][0]])]} />
        </section>

        <ErrorLine error={error} onRetry={reload} />

        {t && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="قيمة السجلات" value={<Money value={t.total} />} sub={`${t.logs} سجل · ${t.invoices} فاتورة`} />
            <Stat label="المدفوع" value={<Money value={t.paid} />} tone="text-green-700" />
            <Stat label="المتبقي" value={<Money value={t.remaining} />} tone={t.remaining > 0 ? "text-red-700" : "text-ink"} />
          </div>
        )}

        {!data ? (
          <SkeletonRows count={6} />
        ) : logs.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-3xl shadow px-4 py-10 text-center">لا توجد سجلات مطابقة لهذه التصفية.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {logs.map((l) => <LogCard key={l.id} log={l} people={data.agents?.[l.route]} />)}
          </div>
        )}
      </main>
    </div>
  );
}
