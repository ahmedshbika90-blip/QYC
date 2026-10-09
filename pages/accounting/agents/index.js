import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import Icon from "../../../components/Icon";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, Stat, ErrorLine, agentName, presetPeriod } from "../../../components/accounting/parts";

// المناديب — what each agent still owes over all his invoice logs, plus
// everyone together. "سجلاته" opens the logs page filtered to him.
export default function Agents() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const p = presetPeriod("month");
  const { data, error, reload } = useApi(token, `/api/accounting/agents?from=${p.from}&to=${p.to}`);
  if (loading) return <PageLoading />;
  const c = data?.combined;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">المناديب</h1>
          <p className="text-ink-soft mt-1">ما على كل مندوب من كل سجلاته حتى اليوم.</p>
        </div>
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          <SkeletonRows count={4} />
        ) : (
          <>
            <section aria-label="الكل معًا" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat label="المتبقي على كل المناديب" value={<Money value={c.allTime.remaining} />} tone={c.allTime.remaining > 0 ? "text-red-700" : "text-ink"} />
              <Stat label="مدفوع هذا الشهر" value={<Money value={c.period.paid} />} tone="text-green-700" sub={`من ${c.period.logs || 0} سجل`} />
              <Stat label="هامش التشغيل هذا الشهر" value={typeof c.period.margin === "number" ? <Money value={c.period.margin} /> : "—"} tone={c.period.margin < 0 ? "text-red-700" : "text-ink"} />
            </section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.agents.map((a) => (
                <div key={a.route} className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4 min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                      <Icon name="truck" size={24} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-xl font-bold text-ink break-words">{agentName(a.people, a.route)}</p>
                      <p className="text-ink-soft">{a.label}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-ink-soft">المتبقي عليه</p>
                    <p className={`font-display text-3xl font-bold ${a.allTime.remaining > 0 ? "text-red-700" : "text-green-700"}`}>
                      <Money value={a.allTime.remaining} />
                    </p>
                    <p className="text-ink-soft mt-1">
                      {a.openLogs ? (
                        <>
                          <span className="num">{a.openLogs}</span> سجل غير مكتمل · أقدمها <span className="num">{a.oldestOpen}</span>
                        </>
                      ) : (
                        "كل سجلاته مدفوعة"
                      )}
                    </p>
                  </div>
                  <Link href={`/accounting/logs?route=${a.route}`} className="h-12 rounded-xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2">
                    سجلاته
                    <Icon name="chevronLeft" size={18} className="rtl-flip" />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
