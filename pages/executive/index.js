import { useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
// Logos go through Next.js image optimisation: each is resized to the size
// it's shown at and served as WebP (e.g. the 140 KB company logo becomes a
// few KB). Static imports → content-hashed URLs, cached for a year.
import mahgoubLogo from "../../public/brand/mahgoub.png";
import alwafiLogo from "../../public/brand/alwafi.png";
import chipsianoPack from "../../public/brand/chipsiano.webp";
import markWhite from "../../public/brand/mahgoub-mark-white.png";
import markBlue from "../../public/brand/mahgoub-mark.png";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import WelcomeHeader from "../../components/WelcomeHeader";
import { Section, TrendChart } from "../../components/SupervisorDashboard";
import { DonutChart, PieChart, BarList, Split, pctText } from "../../components/ExecCharts";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { buildTrend, todayYmd, V, fmt } from "../../lib/dashboardView";
import { useLang } from "../../lib/i18n";

// The executive's dashboard — view only, three tabs:
//   ملخص العمليات   sales trend, mix charts, invoices and sales value at cost
//   العملاء والمسارات  customer base, routes, top ten customers
//   المخزون          stock now, and goods received into the warehouse
// Nothing on this page can change data; every figure comes from
// /api/executive/* (prices and margin are never sent to this role).

const TABS = [
  { id: "overview", label: "ملخص العمليات", icon: "chart" },
  { id: "customers", label: "العملاء والمسارات", icon: "users" },
  { id: "inventory", label: "المخزون", icon: "box" },
];
import { UNIT, GROUP_COLOR, productColor, money, Card, useGet, ErrorBox, PeriodPicker, Kpi, Stat, addDaysYmd } from "../../components/exec/parts";

import { TIME_ZONE } from "../../lib/companyConfig";
// Tabs 2 and 3 are separate downloads, fetched only when opened — the
// overview (the tab everyone lands on) doesn't carry their code.
const tabLoading = () => <SkeletonRows count={6} />;
const CustomersTab = dynamic(() => import("../../components/exec/CustomersTab"), { loading: tabLoading });
const InventoryTab = dynamic(() => import("../../components/exec/InventoryTab"), { loading: tabLoading });
const CompetitorsCard = dynamic(() => import("../../components/exec/CompetitorsCard"), { ssr: false });

/* ── Tab 1: ملخص العمليات ──────────────────────────────────────────────── */

function OverviewTab({ token, range, setRange }) {
  const [kind, setKind] = useState("day");
  const trend = useGet(token, `/api/dashboard/trend?bucket=${kind}`, ["orders_car1", "orders_car2"]);
  const sum = useGet(token, `/api/executive/overview?from=${range.from}&to=${range.to}`, ["orders_car1", "orders_car2"]);
  const d = sum.data;
  const h = d?.headline;

  return (
    <div className="flex flex-col gap-10">
      <Section id="x0" title="تطور المبيعات" hint="عدد الوحدات المباعة عبر الزمن، جملة وتجزئة. مرّر المؤشر على المنحنى لرؤية أي نقطة.">
        <TrendChart trend={trend.data ? buildTrend(trend.data) : null} kind={kind} onKind={setKind} loading={trend.busy} />
      </Section>

      <PeriodPicker range={range} onChange={(from, to) => setRange({ from, to })} title="فترة الأرقام أدناه" />

      {h ? (
        <div className={`grid gap-3 grid-cols-2 lg:grid-cols-5 ${sum.busy ? "opacity-60" : ""}`}>
          <Kpi icon="box" label="الوحدات المباعة" value={fmt(h.units.value)} unit={UNIT} change={h.units.change} />
          <Kpi icon="file" label="الفواتير" value={fmt(h.invoices.value)} change={h.invoices.change} tone="r" />
          <Kpi icon="chart" label="قيمة المبيعات (بالتكلفة)" value={money(h.costValue.value)} unit="SDG" change={h.costValue.change} tone="w" />
          <Kpi icon="users" label="عملاء اشتروا" value={fmt(h.customers.value)} change={h.customers.change} />
          <Kpi icon="file" label="متوسط الفاتورة (بالتكلفة)" value={money(h.avgInvoice.value)} unit="SDG" change={h.avgInvoice.change} tone="r" />
        </div>
      ) : (
        !sum.error && <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="exec-card h-[138px] animate-pulse" />)}</div>
      )}
      {h && <p className="text-xs text-muted -mt-6">الأسهم تقارن بالفترة السابقة بنفس الطول.</p>}

      <ErrorBox error={sum.error} onRetry={sum.reload} />
      {!d ? (
        !sum.error && <div className="grid gap-5 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="bg-white rounded-2xl shadow h-[360px] animate-pulse" />)}</div>
      ) : (
        <div className={`flex flex-col gap-12 ${sum.busy ? "opacity-60" : ""}`}>
          <Section id="x1" title="توزيع المبيعات" hint="بالوحدات المباعة في الفترة المختارة (بدون العينات المجانية والفواتير الملغاة).">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
              <Card className="p-6 flex flex-col gap-4">
                <h3 className="text-[0.9375rem] font-bold text-ink">الجملة والتجزئة من إجمالي المبيعات</h3>
                <DonutChart
                  ariaLabel="نسبة مبيعات الجملة والتجزئة"
                  centerValue={fmt(d.totals.units)}
                  centerLabel="إجمالي الوحدات"
                  segments={[
                    { key: "w", label: "جملة", value: d.wholesale.units, color: V("w") },
                    { key: "r", label: "تجزئة", value: d.retail.units, color: V("r") },
                  ]}
                />
              </Card>
              <Card className="p-6 flex flex-col gap-4">
                <h3 className="text-[0.9375rem] font-bold text-ink">الوافي وشيبسيانو من الوحدات المباعة</h3>
                <PieChart
                  ariaLabel="نسبة منتجات الوافي وشيبسيانو"
                  segments={d.groups.map((g) => ({ key: g.id, label: g.label, value: g.units, color: GROUP_COLOR[g.id] }))}
                />
              </Card>
              <Card className="p-6 flex flex-col gap-4 md:col-span-2 xl:col-span-1">
                <h3 className="text-[0.9375rem] font-bold text-ink">الوحدات المباعة لكل صنف</h3>
                <BarList
                  unit={UNIT}
                  rows={d.products.map((p, i) => ({
                    id: p.id,
                    label: p.name,
                    value: p.units,
                    share: p.share,
                    color: productColor(p.group, i),
                    sub: `جملة ${fmt(p.w)} · تجزئة ${fmt(p.r)}`,
                  }))}
                />
              </Card>
            </div>
          </Section>

          <Section id="x2" title="الفواتير وقيمة المبيعات" hint="قيمة المبيعات محسوبة بتكلفة الأصناف المسجلة في المخزون، وليس بسعر البيع.">
            <div className="grid gap-5 md:grid-cols-2">
              <Card className="p-6 flex flex-col gap-5">
                <h3 className="text-[0.9375rem] font-bold text-ink">الفواتير الصادرة</h3>
                <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                  <span className="dn font-display fig font-bold text-ink">{fmt(d.totals.invoices)}</span>
                  <span className="text-sm text-muted">فاتورة</span>
                </div>
                <Split a={d.wholesale.invoices} b={d.retail.invoices} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="جملة" value={fmt(d.wholesale.invoices)} color="w" sub={pctText(d.totals.invoices ? (d.wholesale.invoices / d.totals.invoices) * 100 : 0)} />
                  <Stat label="تجزئة" value={fmt(d.retail.invoices)} color="r" sub={pctText(d.totals.invoices ? (d.retail.invoices / d.totals.invoices) * 100 : 0)} />
                </div>
              </Card>
              <Card className="p-6 flex flex-col gap-5">
                <h3 className="text-[0.9375rem] font-bold text-ink">قيمة المبيعات (بالتكلفة)</h3>
                <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                  <span className="dn font-display fig font-bold text-ink">{money(d.totals.costValue)}</span>
                  <span className="text-sm text-muted">SDG</span>
                </div>
                <Split a={d.wholesale.costValue} b={d.retail.costValue} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="جملة" value={money(d.wholesale.costValue)} unit="SDG" color="w" sub={pctText(d.totals.costValue ? (d.wholesale.costValue / d.totals.costValue) * 100 : 0)} />
                  <Stat label="تجزئة" value={money(d.retail.costValue)} unit="SDG" color="r" sub={pctText(d.totals.costValue ? (d.retail.costValue / d.totals.costValue) * 100 : 0)} />
                </div>
                {d.totals.uncostedUnits > 0 && (
                  <p className="flex items-start gap-2 text-xs text-muted m-0">
                    <Icon name="info" size={16} className="mt-0.5" />
                    <span><span className="dn">{fmt(d.totals.uncostedUnits)}</span> وحدة بدون تكلفة مسجلة لم تُحتسب في القيمة.</span>
                  </p>
                )}
              </Card>
            </div>
          </Section>
        </div>
      )}
      {/* Competitor prices from the market, under the sales figures. */}
      <CompetitorsCard token={token} />
    </div>
  );
}

function BrandRibbon({ token, range }) {
  const { data } = useGet(token, `/api/executive/overview?from=${range.from}&to=${range.to}`, ["orders_car1", "orders_car2"]);
  const g = Object.fromEntries((data?.groups || []).map((x) => [x.id, x]));
  const total = data?.totals?.units;
  const Fig = ({ value, sub, onBrand = false }) => (
    <p className={`flex flex-wrap items-baseline gap-x-1.5 min-w-0 ${onBrand ? "text-snow" : ""}`}>
      <span className="dn font-display fig-sm font-bold">{value == null ? "—" : fmt(value)}</span>
      <span className={`text-xs ${onBrand ? "text-snow/90" : "text-muted dark:text-snow/80"}`}>{sub}</span>
    </p>
  );
  const Bar = ({ share, color, track }) => (
    <div className="brand-bar h-2 rounded-full overflow-hidden flex" style={{ background: track }}>
      <span className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, share || 0))}%`, background: color }} />
    </div>
  );
  return (
    <section aria-label="علاماتنا التجارية" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      <div className="brand-in d1 exec-card sm:col-span-2 lg:col-span-1 p-4 md:p-5 flex items-center gap-4 overflow-hidden">
        <Image src={mahgoubLogo} width={106} height={92} priority alt="محجوب أولاد الغذائية" className="brand-logo-pop h-[76px] md:h-[92px] w-auto shrink-0" />
        <div className="min-w-0 text-ink dark:text-snow">
          <p className="text-[0.8125rem] font-semibold text-muted dark:text-snow/80">إجمالي المبيعات في الفترة</p>
          <Fig value={total} sub="وحدة" />
          <p className="text-xs text-muted dark:text-snow/75 mt-0.5">{data ? `${fmt(data.totals.invoices)} فاتورة` : " "}</p>
        </div>
      </div>

      <div className="brand-in d2 relative overflow-hidden rounded-[1.25rem] p-4 md:p-5 flex flex-col gap-3 text-snow min-w-0" style={{ background: "linear-gradient(140deg, rgb(142 42 44) 0%, rgb(112 30 34) 100%)", boxShadow: "0 14px 30px -18px rgb(142 42 44 / 0.7)" }}>
        <div className="flex items-start justify-between gap-2">
          <Image src={alwafiLogo} width={88} height={64} priority alt="الوافي" className="brand-logo-pop h-[54px] md:h-[64px] w-auto drop-shadow" />
          {g.alwafi && <span className="dn text-sm font-bold rounded-full px-2.5 h-7 flex items-center" style={{ background: "rgb(240 176 48)", color: "rgb(90 20 22)" }}>{pctText(g.alwafi.share)}</span>}
        </div>
        <Fig onBrand value={g.alwafi?.units} sub="وحدة — طحنية وطحينة" />
        <Bar share={g.alwafi?.share} color="rgb(240 176 48)" track="rgb(255 255 255 / 0.18)" />
      </div>

      <div className="brand-in d3 relative overflow-hidden rounded-[1.25rem] p-4 md:p-5 flex flex-col gap-3 text-snow min-w-0" style={{ background: "linear-gradient(140deg, rgb(247 150 40) 0%, rgb(232 96 20) 100%)", boxShadow: "0 14px 30px -18px rgb(232 96 20 / 0.7)" }}>
        <span aria-hidden="true" className="brand-float absolute -bottom-2 end-[-6px] pointer-events-none">
          <Image
            src={chipsianoPack}
            width={105}
            height={146}
            alt=""
            className="brand-logo-pop h-[124px] md:h-[146px] w-auto"
            style={{ filter: "drop-shadow(0 8px 14px rgb(120 40 0 / 0.35))", maskImage: "linear-gradient(to top, transparent 0%, black 16%)", WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 16%)" }}
          />
        </span>
        <div className="relative flex items-start justify-between gap-2 pe-[72px] md:pe-[88px]">
          <p className="font-display text-xl md:text-2xl font-extrabold tracking-wide" style={{ textShadow: "0 2px 0 rgb(150 50 0 / 0.35)" }} lang="en" data-no-translate>CHIPSIANO</p>
        </div>
        <div className="relative pe-[72px] md:pe-[88px] flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Fig onBrand value={g.snacks?.units} sub="وحدة — شيبسيانو" />
            {g.snacks && <span className="dn text-sm font-bold rounded-full px-2.5 h-7 flex items-center bg-snow/90" style={{ color: "rgb(190 70 10)" }}>{pctText(g.snacks.share)}</span>}
          </div>
          <Bar share={g.snacks?.share} color="rgb(255 255 255)" track="rgb(255 255 255 / 0.28)" />
        </div>
      </div>
    </section>
  );
}

// The hero's other side: today's day and date in a soft glass card, so the
// greeting has a counterweight on wide screens and a tidy row on phones.
function TodayCard() {
  const lang = useLang();
  const now = new Date();
  const loc = lang === "en" ? "en-GB" : "ar-EG";
  const opts = (o) => new Intl.DateTimeFormat(loc, { timeZone: TIME_ZONE, numberingSystem: "latn", ...o }).format(now);
  return (
    <div className="flex md:flex-col items-center md:items-end justify-between gap-3 rounded-2xl bg-snow/10 backdrop-blur px-4 py-3 md:px-5 md:py-4 border border-snow/20 md:min-w-[200px]" data-no-translate>
      <div className="md:text-end">
        <p className="text-xs text-snow/75">{opts({ weekday: "long" })}</p>
        <p className="font-display text-lg md:text-xl font-bold text-snow leading-tight">{opts({ day: "numeric", month: "long" })}</p>
      </div>
      <p className="text-sm text-snow/80 num">{opts({ year: "numeric" })}</p>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function ExecutiveDashboard() {
  const router = useRouter();
  const { role, token, loading, logout } = useAuth(["executive"]);
  const tab = TABS.some((t) => t.id === router.query.tab) ? router.query.tab : "overview";
  // Opens on the last 7 days — a fuller picture than "today" at first glance.
  const [range, setRange] = useState(() => ({ from: addDaysYmd(todayYmd(), -6), to: todayYmd() }));
  const setTab = (id) => router.replace({ pathname: "/executive", query: id === "overview" ? {} : { tab: id } }, undefined, { shallow: true });

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="dash relative max-w-[1320px] mx-auto px-4 md:px-8 pt-5 md:pt-8 pb-12 md:pb-16 flex flex-col gap-6">
        <div aria-hidden="true" className="exec-aurora"><span className="a1" /><span className="a2" /><span className="a3" /></div>
        <header className="exec-hero relative z-[1] overflow-hidden rounded-3xl px-5 py-6 md:px-8 md:py-7 text-snow">
          <span aria-hidden="true" className="exec-hero-orb exec-hero-orb-1" />
          <span aria-hidden="true" className="exec-hero-orb exec-hero-orb-2" />
          {/* Company wheat mark as a watermark: white on the green glass by
              day, the company's own blue with a soft glow by night. */}
          {/* Lazy (next/image default): the hidden one for the other theme is never downloaded. */}
          <Image src={markWhite} width={230} height={276} alt="" aria-hidden="true" className="exec-watermark exec-watermark-light" />
          <Image src={markBlue} width={230} height={276} alt="" aria-hidden="true" className="exec-watermark exec-watermark-dark" />
          <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <WelcomeHeader token={token} dark subtitle="أهلًا بك في مباشر" />
            <TodayCard />
          </div>
        </header>

        <div className="relative z-[1]">
          <BrandRibbon token={token} range={range} />
        </div>

        <nav role="tablist" aria-label="أقسام اللوحة" className="exec-tabs grid grid-cols-3 gap-1 p-1.5 rounded-2xl sticky top-[4.5rem] z-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-w-0 min-h-[56px] sm:min-h-[48px] px-1.5 py-1.5 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all ${
                tab === t.id ? "bg-accent text-on-accent font-bold shadow" : "text-ink-soft font-medium hover:bg-surface-2"
              }`}
            >
              <Icon name={t.icon} size={18} />
              {/* Full label, wrapping onto two short lines on narrow phones — never cut with "…" */}
              <span className="text-[0.75rem] sm:text-sm leading-tight text-center whitespace-normal">{t.label}</span>
            </button>
          ))}
        </nav>

        <div key={tab} className="welcome-in">
          {tab === "overview" && <OverviewTab token={token} range={range} setRange={setRange} />}
          {tab === "customers" && <CustomersTab token={token} range={range} setRange={setRange} />}
          {tab === "inventory" && <InventoryTab token={token} />}
        </div>
      </main>
    </div>
  );
}
