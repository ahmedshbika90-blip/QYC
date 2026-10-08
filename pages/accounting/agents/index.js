import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import Icon from "../../../components/Icon";
import DateFields from "../../../components/DateFields";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, Stat, ErrorLine, MarginValue, agentName, day, defaultPeriod, money } from "../../../components/accounting/parts";

// Accountant home — المناديب: everyone together first (what's owed in
// total, what's waiting to be distributed), then one card per agent (van):
// what he still owes over all his logs, his oldest unpaid day, and the
// chosen period. Tap an agent for his logs.
export default function Agents() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [p, setP] = useState(defaultPeriod);
  const { data, error, reload } = useApi(token, `/api/accounting/agents?from=${p.from}&to=${p.to}`);
  if (loading) return <PageLoading />;
  const c = data?.combined;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-4xl mx-auto px-4 sm:px-8 pt-5 pb-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">المناديب</h1>
            <p className="text-sm text-ink-soft mt-1">ما على كل مندوب من سجلات الفواتير، وما ينتظر التوزيع.</p>
          </div>
          <Link href="/accounting/reports" className="h-11 px-4 rounded-xl border-2 border-line bg-white text-ink font-semibold flex items-center gap-2">
            <Icon name="file" size={18} />
            التقارير
          </Link>
        </div>

        <ErrorLine error={error} onRetry={reload} />

        <section aria-labelledby="all-title" className="flex flex-col gap-3">
          <h2 id="all-title" className="font-display text-lg font-bold text-ink">الكل معًا</h2>
          {!c ? (
            <SkeletonRows count={2} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="المتبقي على المناديب" value={<Money value={c.allTime.remaining} />} tone={c.allTime.remaining > 0 ? "text-red-700" : "text-ink"} sub="كل الفترات" />
              <Stat label="بانتظار التوزيع" value={<Money value={c.allTime.toDistribute} />} tone={c.allTime.toDistribute > 0 ? "text-amber-700" : "text-ink"} sub="مستلم ولم يوزَّع على العملاء" />
              <Stat label="فواتير الفترة" value={<Money value={c.period.total} />} sub={`${money(c.period.invoices)} فاتورة`} />
              <Stat label="المدفوع في الفترة" value={<Money value={c.period.paid} />} sub={`${c.period.paidLogs || 0} سجل مكتمل من ${c.period.logs || 0}`} />
              <Stat label="هامش التشغيل في الفترة" value={<MarginValue t={c.period} />} tone={c.period.margin < 0 ? "text-red-700" : "text-green-700"} />
            </div>
          )}
        </section>

        <section aria-labelledby="agents-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="agents-title" className="font-display text-lg font-bold text-ink">كل مندوب</h2>
            <DateFields from={p.from} to={p.to} onFrom={(from) => setP((x) => ({ ...x, from }))} onTo={(to) => setP((x) => ({ ...x, to }))} compact />
          </div>
          {!data ? (
            <SkeletonRows count={3} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.agents.map((a) => (
                <Link key={a.route} href={`/accounting/agents/${a.route}`} className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4 hover:shadow-lg active:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl font-bold text-ink truncate">{agentName(a.people, a.route)}</p>
                      <p className="text-sm text-ink-soft">{a.label} · آخر سجل {day(a.lastDay)}</p>
                    </div>
                    <span className="w-11 h-11 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                      <Icon name="truck" size={22} />
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-ink-soft">المتبقي عليه</p>
                    <p className={`font-display text-3xl font-bold ${a.allTime.remaining > 0 ? "text-red-700" : "text-green-700"}`}>
                      <Money value={a.allTime.remaining} />
                    </p>
                    <p className="text-sm text-ink-soft mt-1">
                      {a.openLogs ? <>{a.openLogs} سجل غير مكتمل · أقدمها {day(a.oldestOpen)}</> : "كل سجلاته مدفوعة"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center border-t border-line pt-3">
                    <div>
                      <p className="text-xs text-ink-soft">فواتير الفترة</p>
                      <p className="font-bold text-ink"><Money value={a.period.total} /></p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-soft">المدفوع</p>
                      <p className="font-bold text-ink"><Money value={a.period.paid} /></p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-soft">هامش التشغيل</p>
                      <p className={`font-bold ${a.period.margin < 0 ? "text-red-700" : "text-green-700"}`}>{typeof a.period.margin === "number" ? <Money value={a.period.margin} /> : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-soft">بانتظار التوزيع</p>
                      <p className={`font-bold ${a.allTime.toDistribute > 0 ? "text-amber-700" : "text-ink"}`}><Money value={a.allTime.toDistribute} /></p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
