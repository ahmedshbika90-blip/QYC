import { useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { useApi, Money, Stat, ErrorLine, Choice, presetPeriod, todayYmd, money, ROUTE_LABEL } from "../../components/accounting/parts";

// التحصيل — money received by the date it was RECEIVED (transfer date),
// whatever day the invoices were from: per day, per bank, per agent, and
// every payment with its reference — to match against the bank statement.
const PERIODS = [
  ["today", "اليوم"],
  ["week", "هذا الأسبوع"],
  ["month", "هذا الشهر"],
  ["custom", "تاريخ محدد"],
];
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";

export default function Collections() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [preset, setPreset] = useState("week");
  const [p, setP] = useState(() => presetPeriod("week"));
  const [route, setRoute] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data, error, reload } = useApi(token, `/api/accounting/collections?from=${p.from}&to=${p.to}${route ? `&route=${route}` : ""}`);
  function choose(k) {
    setPreset(k);
    if (k === "today") setP({ from: todayYmd(), to: todayYmd() });
    else if (k !== "custom") setP(presetPeriod(k));
  }
  if (loading) return <PageLoading />;
  const max = Math.max(1, ...(data?.byDay || []).map((d) => d.amount));
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">التحصيل</h1>
          <p className="text-ink-soft mt-1">المبالغ المستلمة حسب تاريخ التحويل، أيًّا كان يوم الفواتير — للمطابقة مع كشف البنك.</p>
        </div>
        <div>
          <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className="flex items-center gap-2 text-ink bg-white rounded-xl px-4 h-12 shadow-sm font-semibold">
            <Icon name="filter" size={18} className="text-ink-soft" />
            تصفية · <span className="num" dir="ltr">{p.from === p.to ? p.from : `${p.from} → ${p.to}`}</span>
            <Icon name="chevronDown" size={18} className={`text-ink-soft transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          {filtersOpen && (
            <section className="bg-white rounded-3xl shadow p-4 sm:p-5 mt-2 flex flex-col gap-4">
              <Choice label="الفترة" value={preset} onChange={choose} options={PERIODS} />
              {preset === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">من<input type="date" value={p.from} max={p.to} onChange={(e) => e.target.value && setP((x) => ({ ...x, from: e.target.value }))} className={field} /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">إلى<input type="date" value={p.to} min={p.from} max={todayYmd()} onChange={(e) => e.target.value && setP((x) => ({ ...x, to: e.target.value }))} className={field} /></label>
                </div>
              )}
              <Choice label="المندوب" value={route} onChange={setRoute} options={[["", "الكل"], ["car1", ROUTE_LABEL.car1], ["car2", ROUTE_LABEL.car2]]} />
            </section>
          )}
        </div>
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat label="إجمالي المستلم" value={<Money value={data.total} />} tone="text-green-700" sub={`${data.count} دفعة`} />
              {data.returnedTotal > 0 && <Stat label="مبالغ مردودة للعملاء" value={<Money value={data.returnedTotal} />} tone="text-red-700" sub={`الصافي ${money(data.net)}`} />}
              {data.byRoute.map((r) => (
                <Stat key={r.route} label={`مندوب ${ROUTE_LABEL[r.route] || r.route}`} value={<Money value={r.amount} />} />
              ))}
            </div>
            {data.byBank.length > 0 && (
              <section className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold text-ink">حسب البنك</h2>
                <ul className="flex flex-col gap-2">
                  {data.byBank.map((b) => (
                    <li key={b.bank} className="flex flex-wrap justify-between gap-2"><span>{b.bankLabel}</span><Money value={b.amount} className="font-bold" /></li>
                  ))}
                </ul>
              </section>
            )}
            {data.byDay.length > 0 && (
              <section className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold text-ink">حسب اليوم</h2>
                <ul className="flex flex-col gap-3">
                  {data.byDay.map((d) => (
                    <li key={d.date} className="flex flex-col gap-1">
                      <div className="flex flex-wrap justify-between gap-2"><span className="num">{d.date}</span><Money value={d.amount} className="font-bold" /></div>
                      <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${(d.amount / max) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.returns?.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold text-ink">مبالغ مردودة للعملاء</h2>
                <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                  {data.returns.map((x) => (
                    <li key={x.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink break-words">{x.method === "cash" ? "نقدًا" : <>{x.bankLabel} · <span className="num" dir="ltr">{x.ref}</span></>}</p>
                        <p className="text-ink-soft break-words"><span className="num">{x.date}</span> · {ROUTE_LABEL[x.route] || x.route} · {x.clients.join("، ")}</p>
                      </div>
                      <span className="num text-lg font-bold text-red-700">− {money(x.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold text-ink">الدفعات</h2>
              {data.payments.length === 0 ? (
                <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد دفعات في هذه الفترة.</p>
              ) : (
                <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                  {data.payments.map((x) => (
                    <li key={x.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink break-words">{x.bankLabel} · <span className="num" dir="ltr">{x.ref}</span></p>
                        <p className="text-ink-soft break-words">
                          <span className="num">{x.date}</span> · {ROUTE_LABEL[x.route] || x.route} · سجلات{" "}
                          {x.logIds.map((l) => <a key={l} href={`/accounting/logs/${encodeURIComponent(l)}`} className="num text-accent-ink font-semibold me-1.5" dir="ltr">{l.slice(-10)}</a>)}
                        </p>
                      </div>
                      <span className="num text-lg font-bold">{money(x.amount)}</span>
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
