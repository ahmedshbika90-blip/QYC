import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import FilterChips from "../../components/FilterChips";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { groupByItem, topMoves, distinct, weightText } from "../../lib/competitorView";
import { normalizeAr } from "../../lib/arabicSearch";
import { formatDate, formatNumber } from "../../lib/labels";
import { Sparkline, Change } from "../../components/exec/CompetitorBits";

import { TIME_ZONE } from "../../lib/companyConfig";
// Competitor prices for the executive (view only), entered in the market by
// the sales supervisor; updates live.
//   hero          how much is tracked, and when it was last updated
//   biggest moves the largest price changes, at a glance
//   by item       per item + weight: every company's latest price, cheapest
//                 first, a bar to compare, the change and a small trend line
//   all entries   the raw log
const PERIODS = [
  ["30", "30 يومًا"],
  ["90", "3 أشهر"],
  ["365", "سنة"],
];
const day = (ymd) => formatDate(`${ymd}T12:00:00Z`);
const Card = ({ className = "", children }) => <div className={`exec-card min-w-0 ${className}`}>{children}</div>;

function ItemCard({ g }) {
  const spread = g.rows.length > 1 ? g.max - g.min : 0;
  return (
    <Card className="p-0 overflow-hidden flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink leading-snug">
            {g.item}
            {g.weight && <span className="ms-2 align-middle text-xs font-bold text-accent-ink bg-accent-soft rounded-full px-2 py-0.5">{g.weight}</span>}
          </h2>
          <p className="text-xs text-muted mt-1">
            <span className="num">{g.companies}</span> {g.companies === 1 ? "شركة" : "شركات"} · آخر تحديث {day(g.latestDate)}
            {g.sku && <> · <span className="num" dir="ltr">{g.sku}</span></>}
          </p>
        </div>
        {spread > 0 && (
          <div className="text-end shrink-0">
            <p className="text-[0.6875rem] text-muted">الفرق بين الأعلى والأقل</p>
            <p className="num font-bold text-ink">{formatNumber(spread)}</p>
          </div>
        )}
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {g.rows.map((r, i) => {
          const lowest = g.rows.length > 1 && i === 0;
          const highest = g.rows.length > 1 && i === g.rows.length - 1;
          const width = g.max ? Math.max(8, (r.price / g.max) * 100) : 100;
          return (
            <li key={r.company} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">
                    {r.company}
                    {lowest && <span className="ms-2 text-[0.6875rem] font-bold text-green-700 bg-green-50 rounded-md px-1.5 py-0.5">الأقل سعرًا</span>}
                    {highest && <span className="ms-2 text-[0.6875rem] font-bold text-red-700 bg-red-50 rounded-md px-1.5 py-0.5">الأعلى سعرًا</span>}
                  </p>
                  <p className="text-xs text-muted mt-0.5 truncate">
                    {day(r.date)}
                    {r.route && <> · {r.route}</>}
                    {r.prev && <> · كان <span className="num">{formatNumber(r.prev.price)}</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Sparkline values={r.history} up={r.change > 0} />
                  <div className="text-end">
                    <p className="num text-lg font-bold text-ink leading-tight">{formatNumber(r.price)}</p>
                    <Change row={r} />
                  </div>
                </div>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <span className={`block h-full rounded-full ${lowest ? "bg-green-500" : highest ? "bg-red-400" : "bg-accent"}`} style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function HeroStat({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-snow/10 border border-snow/20 backdrop-blur px-4 py-3 min-w-0">
      <p className="text-xs text-snow/80">{label}</p>
      <p className="font-display text-2xl font-bold text-snow mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[0.6875rem] text-snow/70 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl bg-surface-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`h-10 px-3 rounded-lg text-sm ${value === v ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function ExecutiveCompetitors() {
  const { role, token, loading, logout } = useAuth(["executive", "manager"]);
  const [days, setDays] = useState("90");
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [route, setRoute] = useState("");
  const [view, setView] = useState("items");

  const url = `/api/competitors?days=${days}`;
  const load = useCallback(async () => {
    setError("");
    try {
      const d = await cachedGet(apiFetch, url, token);
      setEntries(d.entries);
    } catch (err) {
      setError(err.message);
    }
  }, [token, url]);
  useEffect(() => {
    if (!token) return;
    setEntries(null);
    load();
  }, [token, load]);
  useLiveRefresh(token, ["competitors"], load);

  const companies = useMemo(() => distinct(entries || [], "company"), [entries]);
  const routes = useMemo(() => distinct(entries || [], "deliveryRoute"), [entries]);
  const filtered = useMemo(() => {
    const s = normalizeAr(q);
    return (entries || []).filter((e) => {
      if (company && e.company !== company) return false;
      if (route && e.deliveryRoute !== route) return false;
      if (!s) return true;
      return [e.company, e.item, e.sku, e.deliveryRoute, weightText(e)].some((v) => normalizeAr(v).includes(s));
    });
  }, [entries, q, company, route]);
  const groups = useMemo(() => groupByItem(filtered), [filtered]);
  const moves = useMemo(() => topMoves(groups), [groups]);
  const itemCount = useMemo(() => groupByItem(entries || []).length, [entries]);
  const monthStart = new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE }).slice(0, 8) + "01";

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="dash max-w-5xl mx-auto px-4 md:px-8 pt-5 pb-10 flex flex-col gap-5">
        <header className="exec-hero relative overflow-hidden rounded-3xl px-5 py-6 md:px-8 md:py-7 text-snow">
          <span aria-hidden="true" className="exec-hero-orb exec-hero-orb-1" />
          <span aria-hidden="true" className="exec-hero-orb exec-hero-orb-2" />
          <div className="relative flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="w-12 h-12 rounded-2xl bg-snow/15 flex items-center justify-center shrink-0">
                <Icon name="tag" size={24} />
              </span>
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold">أسعار المنافسين</h1>
                <p className="text-sm text-snow/80 mt-1">من السوق مباشرة — يُدخلها مشرف المبيعات، وتتحدث تلقائيًا.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <HeroStat label="أصناف متابَعة" value={entries ? itemCount : "—"} />
              <HeroStat label="شركات منافسة" value={entries ? companies.length : "—"} />
              <HeroStat label="أسعار هذا الشهر" value={entries ? entries.filter((e) => e.date >= monthStart).length : "—"} />
              <HeroStat label="آخر تحديث" value={entries?.length ? day(entries[0].date) : "—"} sub={entries?.[0]?.createdByName || undefined} />
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented label="الفترة" value={days} onChange={setDays} options={PERIODS} />
            <Segmented label="طريقة العرض" value={view} onChange={setView} options={[["items", "حسب الصنف"], ["log", "كل الإدخالات"]]} />
          </div>
          <div className="relative">
            <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الصنف أو الشركة أو المسار..." className="h-12 w-full rounded-xl border border-line bg-white ps-10 pe-3 text-base" />
          </div>
          {routes.length > 1 && <FilterChips label="المسار" value={route} onChange={setRoute} options={routes.map((c) => [c, c])} />}
          {companies.length > 1 && <FilterChips label="الشركة" value={company} onChange={setCompany} options={companies.map((c) => [c, c])} />}
        </div>

        {error && (
          <div role="alert" className="text-red-600 text-sm flex items-center gap-2">
            <span>{error}</span>
            <button type="button" onClick={load} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {!entries ? (
          !error && <SkeletonRows count={5} />
        ) : entries.length === 0 ? (
          <Card className="p-8 text-center">
            <span className="w-14 h-14 mx-auto rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center">
              <Icon name="tag" size={26} />
            </span>
            <p className="font-semibold text-ink mt-3">لا توجد أسعار في هذه الفترة</p>
            <p className="text-sm text-muted mt-1">ستظهر هنا فور إدخال مشرف المبيعات لأول سعر.</p>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-muted">لا توجد نتائج مطابقة.</p>
        ) : view === "items" ? (
          <>
            {moves.length > 0 && (
              <section aria-labelledby="moves-title" className="flex flex-col gap-2">
                <h2 id="moves-title" className="font-display text-lg font-bold text-ink flex items-center gap-2">
                  <Icon name="trendUp" size={20} className="text-accent-ink" />
                  أبرز تغيّرات الأسعار
                </h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                  {moves.map((m) => (
                    <Card key={`${m.key}-${m.company}`} className="p-4 shrink-0 w-[230px] flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-ink text-sm leading-snug">
                          {m.item} {m.weight && <span className="text-accent-ink">{m.weight}</span>}
                        </p>
                        <Change row={m} compact />
                      </div>
                      <p className="text-xs text-muted truncate">{m.company}</p>
                      <p className="text-sm">
                        <span className="num text-muted line-through">{formatNumber(m.prev.price)}</span>
                        <span className="mx-1.5 text-muted" aria-hidden="true">←</span>
                        <span className="num font-bold text-ink text-base">{formatNumber(m.price)}</span>
                      </p>
                      <p className="text-[0.6875rem] text-muted">{day(m.date)}</p>
                    </Card>
                  ))}
                </div>
              </section>
            )}
            <div className="grid gap-4 md:grid-cols-2 items-start">
              {groups.map((g) => <ItemCard key={g.key} g={g} />)}
            </div>
          </>
        ) : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-xs text-muted border-b border-line">
                  <th className="px-4 py-3 text-start font-semibold">التاريخ</th>
                  <th className="px-4 py-3 text-start font-semibold">المسار</th>
                  <th className="px-4 py-3 text-start font-semibold">الشركة</th>
                  <th className="px-4 py-3 text-start font-semibold">الصنف</th>
                  <th className="px-4 py-3 text-start font-semibold">الوزن</th>
                  <th className="px-4 py-3 text-end font-semibold">السعر</th>
                  <th className="px-4 py-3 text-start font-semibold">أدخله</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{day(e.date)}</td>
                    <td className="px-4 py-3">{e.deliveryRoute || "—"}</td>
                    <td className="px-4 py-3">{e.company}</td>
                    <td className="px-4 py-3">{e.item}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{weightText(e) || (e.sku ? <span className="num" dir="ltr">{e.sku}</span> : "—")}</td>
                    <td className="px-4 py-3 text-end num font-semibold text-ink">{formatNumber(e.price)}</td>
                    <td className="px-4 py-3 text-muted">{e.createdByName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
