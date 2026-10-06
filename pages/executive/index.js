import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import StockBoard from "../../components/StockBoard";
import DateFields from "../../components/DateFields";
import WelcomeHeader from "../../components/WelcomeHeader";
import { DateRange, Section, TrendChart } from "../../components/SupervisorDashboard";
import { DonutChart, PieChart, BarList, Split, pctText } from "../../components/ExecCharts";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { buildTrend, rangeText, todayYmd, V, fmt } from "../../lib/dashboardView";
import { formatDate, formatDateTime, formatQty, ROUTE_LABELS_SHORT } from "../../lib/labels";
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
const UNIT = "وحدة";
// Product families in their own brand colours (from the logos).
const GROUP_COLOR = { alwafi: "rgb(var(--brand-alwafi))", snacks: "rgb(var(--brand-chips))", other: V("p5") };
const PRODUCT_COLORS = ["p1", "p3", "p2", "p4", "p5", "p6"];
// SDG amounts: thousands separators, no forced decimals (100,000).
const money = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const Card = ({ className = "", children }) => <div className={`exec-card min-w-0 ${className}`}>{children}</div>;

function useGet(token, url, liveKeys) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  async function load() {
    if (!token || !url) return;
    setBusy(true);
    try {
      setData(await cachedGet(apiFetch, url, token));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, url]);
  useLiveRefresh(token, liveKeys, load);
  return { data, error, busy, reload: load };
}

function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm bg-surface-2 text-ink">
      <span className="flex items-center gap-2"><Icon name="alert" size={18} />{error}</span>
      <button type="button" onClick={onRetry} className="font-semibold underline shrink-0">إعادة المحاولة</button>
    </div>
  );
}

/* ── period picker: quick choices + custom dates ─────────────────────── */

const addDaysYmd = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function presets() {
  const t = todayYmd();
  return [
    { id: "today", label: "اليوم", from: t, to: t },
    { id: "yesterday", label: "أمس", from: addDaysYmd(t, -1), to: addDaysYmd(t, -1) },
    { id: "7", label: "آخر 7 أيام", from: addDaysYmd(t, -6), to: t },
    { id: "30", label: "آخر 30 يومًا", from: addDaysYmd(t, -29), to: t },
    { id: "month", label: "هذا الشهر", from: `${t.slice(0, 8)}01`, to: t },
  ];
}

function PeriodPicker({ range, onChange, title = "الفترة" }) {
  const list = presets();
  const match = list.find((p) => p.from === range.from && p.to === range.to);
  const [custom, setCustom] = useState(!match);
  const today = todayYmd();
  const period = { fromYmd: range.from, toYmd: range.to, from: `${range.from}T12:00:00+02:00`, ...(range.from === range.to ? {} : { to: `${range.to}T12:00:00+02:00` }) };
  return (
    <div className="exec-card p-4 md:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink flex items-center gap-2">
          <Icon name="calendar" size={18} className="text-accent-ink" />
          {title}
        </p>
        <p className="text-sm text-muted">{rangeText(period)}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="اختيار الفترة">
        {list.map((p) => {
          const on = !custom && match?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setCustom(false);
                onChange(p.from, p.to);
              }}
              className={`shrink-0 h-10 px-4 rounded-full text-sm border transition-colors ${on ? "bg-accent text-on-accent border-accent font-bold shadow-sm" : "bg-white text-ink-soft border-line hover:border-accent"}`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={`shrink-0 h-10 px-4 rounded-full text-sm border flex items-center gap-1.5 ${custom ? "bg-accent text-on-accent border-accent font-bold shadow-sm" : "bg-white text-ink-soft border-line hover:border-accent"}`}
        >
          <Icon name="calendar" size={15} />
          مخصص
        </button>
      </div>
      {custom && (
        <DateFields
          className="sm:max-w-md"
          from={range.from}
          to={range.to}
          max={today}
          onFrom={(v) => v && onChange(v > range.to ? range.to : v, range.to)}
          onTo={(v) => v && onChange(range.from, v < range.from ? range.from : v)}
        />
      )}
    </div>
  );
}

/* ── headline KPI ───────────────────────────────────────────────────── */

function Delta({ change }) {
  if (change === null) return <span className="text-xs font-semibold text-accent-ink bg-accent-soft rounded-full px-2 h-6 inline-flex items-center">جديد</span>;
  if (!change) return <span className="text-xs text-muted">بدون تغيير</span>;
  const up = change > 0;
  return (
    <span className={`text-xs font-bold rounded-full px-2 h-6 inline-flex items-center gap-1 ${up ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="dn">{pctText(Math.abs(change))}</span>
    </span>
  );
}

function Kpi({ icon, label, value, unit, change, tone = "accent" }) {
  const tones = { accent: "bg-accent-soft text-accent-ink", w: "", r: "" };
  return (
    <div className="exec-card exec-lift p-4 md:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tones[tone] || tones.accent}`} style={tone !== "accent" ? { background: V(tone + "s"), color: V(tone) } : undefined}>
          <Icon name={icon} size={20} />
        </span>
        <Delta change={change} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-muted">{label}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 min-w-0">
          <span className="dn font-display fig-sm font-bold text-ink">{value}</span>
          {unit && <span className="text-xs text-muted">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, color, sub }) {
  return (
    <div className="rounded-xl px-4 py-3.5 min-w-0" style={{ background: color ? V(color + "s") : "rgb(var(--gray-100))" }}>
      <div className="text-[13px] font-semibold" style={{ color: color ? V(color) : "rgb(var(--gray-600))" }}>{label}</div>
      <div className="mt-1 min-w-0"><span className="dn fig-sm font-bold text-ink">{value}</span>{unit && <span className="text-xs text-muted ms-1.5">{unit}</span>}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

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
                <h3 className="text-[15px] font-bold text-ink">الجملة والتجزئة من إجمالي المبيعات</h3>
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
                <h3 className="text-[15px] font-bold text-ink">الوافي وشيبسيانو من الوحدات المباعة</h3>
                <PieChart
                  ariaLabel="نسبة منتجات الوافي وشيبسيانو"
                  segments={d.groups.map((g) => ({ key: g.id, label: g.label, value: g.units, color: GROUP_COLOR[g.id] }))}
                />
              </Card>
              <Card className="p-6 flex flex-col gap-4 md:col-span-2 xl:col-span-1">
                <h3 className="text-[15px] font-bold text-ink">الوحدات المباعة لكل صنف</h3>
                <BarList
                  unit={UNIT}
                  rows={d.products.map((p, i) => ({
                    id: p.id,
                    label: p.name,
                    value: p.units,
                    share: p.share,
                    color: GROUP_COLOR[p.group] || V(PRODUCT_COLORS[i % PRODUCT_COLORS.length]),
                    sub: `جملة ${fmt(p.w)} · تجزئة ${fmt(p.r)}`,
                  }))}
                />
              </Card>
            </div>
          </Section>

          <Section id="x2" title="الفواتير وقيمة المبيعات" hint="قيمة المبيعات محسوبة بتكلفة الأصناف المسجلة في المخزون، وليس بسعر البيع.">
            <div className="grid gap-5 md:grid-cols-2">
              <Card className="p-6 flex flex-col gap-5">
                <h3 className="text-[15px] font-bold text-ink">الفواتير الصادرة</h3>
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
                <h3 className="text-[15px] font-bold text-ink">قيمة المبيعات (بالتكلفة)</h3>
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
    </div>
  );
}

/* ── Tab 2: العملاء والمسارات ───────────────────────────────────────────── */

const ROUTE_COLOR = { car1: "w", car2: "r" };

function CustomersTab({ token, range, setRange }) {
  const { data: d, error, busy, reload } = useGet(token, `/api/executive/customers?from=${range.from}&to=${range.to}`, ["orders_car1", "orders_car2", "clients"]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!d) return <SkeletonRows count={6} />;
  const reg = d.registered;
  return (
    <div className={`flex flex-col gap-12 ${busy ? "opacity-60" : ""}`}>
      <Section
        id="c1"
        title="العملاء المسجلون"
        hint="كل العملاء المسجلين في النظام حتى الآن — لا يتأثر بالفترة المختارة."
        aside={
          <Link href="/executive/customers" className="h-11 px-4 rounded-xl bg-white border border-line text-sm font-semibold text-ink flex items-center gap-2">
            <Icon name="users" size={18} />
            قاعدة العملاء الكاملة
            <Icon name="chevronLeft" size={16} />
          </Link>
        }
      >
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline gap-2 min-w-0">
            <span className="dn font-display fig font-bold text-ink">{fmt(reg.total)}</span>
            <span className="text-sm text-muted">عميل</span>
          </div>
          <Split a={reg.routes[0]?.total || 0} b={reg.routes[1]?.total || 0} />
          <div className="grid gap-3 sm:grid-cols-2">
            {reg.routes.map((r) => (
              <Stat
                key={r.route}
                label={ROUTE_LABELS_SHORT[r.route] || r.route}
                value={fmt(r.total)}
                color={ROUTE_COLOR[r.route]}
                sub={`${pctText(r.share)} من الإجمالي${r.inactive ? ` · ${fmt(r.inactive)} غير نشط` : ""}`}
              />
            ))}
          </div>
        </Card>
      </Section>

      <PeriodPicker range={range} onChange={(from, to) => setRange({ from, to })} title="فترة الأداء — تنطبق على المسارات وأكبر العملاء أدناه" />

      <Section id="c2" title="المسارات" hint="أداء كل مسار في الفترة المختارة. «الوصول» = نسبة العملاء النشطين الذين اشتروا في الفترة.">
        <div className="grid gap-5 md:grid-cols-2">
          {d.routes.map((r) => (
            <Card key={r.route} className="p-6 flex flex-col gap-4">
              <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ color: V(ROUTE_COLOR[r.route]) }}>
                <Icon name="truck" size={18} />
                {ROUTE_LABELS_SHORT[r.route] || r.route}
                <span className="text-xs font-normal text-muted" dir="ltr">{r.route}</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="الفواتير" value={fmt(r.invoices)} />
                <Stat label="الوحدات" value={fmt(r.units)} unit={UNIT} />
                <Stat label="عملاء اشتروا" value={fmt(r.buyers)} />
                <Stat label="الوصول" value={pctText(r.reach)} />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="c3" title="أكبر عشرة عملاء" hint="مرتبون حسب الوحدات المشتراة في الفترة المختارة، مع نصيب كل عميل من إجمالي الوحدات المباعة.">
        {d.top.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">لا توجد مبيعات في هذه الفترة</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-muted border-b border-line">
                  <th className="px-4 py-3 text-start font-semibold w-10">#</th>
                  <th className="px-4 py-3 text-start font-semibold">العميل</th>
                  <th className="px-4 py-3 text-start font-semibold">المسار</th>
                  <th className="px-4 py-3 text-end font-semibold">الفواتير</th>
                  <th className="px-4 py-3 text-end font-semibold">الوحدات</th>
                  <th className="px-4 py-3 text-start font-semibold w-[28%]">من إجمالي الوحدات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.top.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 dn font-bold text-muted">{t.rank}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{t.name || `عميل ${t.id}`} <span className="text-xs text-muted dn">#{t.id}</span></td>
                    <td className="px-4 py-3" style={{ color: V(ROUTE_COLOR[t.route]) }}>{ROUTE_LABELS_SHORT[t.route] || t.route}</td>
                    <td className="px-4 py-3 text-end dn">{fmt(t.invoices)}</td>
                    <td className="px-4 py-3 text-end dn font-bold">{fmt(t.units)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden flex">
                          <span className="h-full rounded-full" style={{ width: `${Math.min(100, (t.share / (d.top[0].share || 1)) * 100)}%`, background: V(ROUTE_COLOR[t.route]) }} />
                        </span>
                        <span className="dn text-xs font-bold w-12 text-end">{pctText(t.share)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}

/* ── Tab 3: المخزون ──────────────────────────────────────────────────────── */

function ReceivedHistory({ token }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [docs, setDocs] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(null);

  const url = (c) => {
    const p = new URLSearchParams({ view: "received" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (c) p.set("cursor", c);
    return `/api/executive/stock?${p}`;
  };
  async function load() {
    setDocs(null);
    try {
      const d = await cachedGet(apiFetch, url(), token);
      setDocs(d.docs);
      setCursor(d.nextCursor);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  async function loadMore() {
    setMore(true);
    try {
      const d = await cachedGet(apiFetch, url(cursor), token);
      setDocs((x) => [...x, ...d.docs]);
      setCursor(d.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setMore(false);
    }
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, from, to]);
  useLiveRefresh(token, ["inventory"], load);

  const totals = {};
  (docs || []).forEach((d) => d.items.forEach((it) => {
    const t = (totals[it.productId] = totals[it.productId] || { name: it.name, unit: it.unit, qty: 0 });
    t.qty += it.qty;
  }));
  const totalRows = Object.entries(totals).sort((a, b) => b[1].qty - a[1].qty);
  const totalUnits = totalRows.reduce((a, [, t]) => a + t.qty, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 w-full sm:w-auto sm:self-start min-w-0">
        <DateFields compact className="flex-1 sm:w-[300px]" from={from} to={to} max={todayYmd()} onFrom={setFrom} onTo={setTo} />
        {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="h-10 px-3 rounded-xl text-sm font-semibold text-ink-soft bg-surface-2 shrink-0">آخر 90 يومًا</button>}
      </div>
      <ErrorBox error={error} onRetry={load} />
      {!docs ? (
        !error && <SkeletonRows count={4} />
      ) : docs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">لم تُستلم بضاعة معتمدة في هذه الفترة.</Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card className="p-6 flex flex-col gap-4 self-start">
              <h3 className="text-[15px] font-bold text-ink">إجمالي المستلم {from || to ? "في الفترة" : "(آخر 90 يومًا)"}</h3>
              <div className="flex flex-wrap items-baseline gap-2 min-w-0"><span className="dn font-display fig font-bold text-ink">{fmt(totalUnits)}</span><span className="text-sm text-muted">{UNIT} · {fmt(docs.length)} مستند</span></div>
              <BarList unit="" rows={totalRows.map(([id, t], i) => ({ id, label: t.name, value: t.qty, share: totalUnits ? (t.qty / totalUnits) * 100 : 0, color: V(PRODUCT_COLORS[i % PRODUCT_COLORS.length]) }))} />
            </Card>
            <Card className="self-start">
              <ul className="divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-start">
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{formatDate(d.createdAt)}</span>
                        <span className="block text-xs text-muted mt-0.5 truncate">{d.items.map((it) => it.name).join("، ")}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="dn font-bold text-ink">{fmt(d.units)}</span>
                        <span className="text-xs text-muted">{UNIT}</span>
                        <Icon name={open === d.id ? "chevronDown" : "chevronLeft"} size={16} className="text-muted" />
                      </span>
                    </button>
                    {open === d.id && (
                      <div className="px-5 pb-4 flex flex-col gap-2">
                        {d.items.map((it, i) => (
                          <div key={i} className="flex justify-between text-sm"><span className="text-ink">{it.name}</span><span className="dn">{formatQty(it.qty)} <span className="text-xs text-muted">{it.unit}</span></span></div>
                        ))}
                        <p className="text-xs text-muted mt-1">اعتُمد {formatDateTime(d.finalizedAt || d.createdAt)}{d.note ? ` · ${d.note}` : ""}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {cursor && (
                <button type="button" onClick={loadMore} disabled={more} className="w-full border-t border-line h-12 text-sm text-ink-soft flex items-center justify-center gap-2 disabled:opacity-50">
                  {more && <Spinner className="w-4 h-4" />}تحميل المزيد
                </button>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function InventoryTab({ token }) {
  const [view, setView] = useState("now");
  const stock = useGet(token, view === "now" ? "/api/executive/stock" : null, ["inventory", "orders_car1", "orders_car2"]);
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="أقسام المخزون" className="inline-flex gap-1 p-1 rounded-xl bg-surface-2 self-start">
        {[["now", "المخزون الحالي"], ["received", "سجل الاستلام"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`h-10 px-4 rounded-lg text-sm ${view === id ? "bg-white font-bold shadow-sm text-ink" : "text-muted font-medium"}`}>
            {label}
          </button>
        ))}
      </div>
      {view === "now" ? (
        <Section id="i1" title="المخزون الحالي" hint="الرصيد اللحظي في المخزن الرئيسي وفي كل سيارة — بالكميات فقط.">
          <ErrorBox error={stock.error} onRetry={stock.reload} />
          {stock.data ? <StockBoard products={stock.data.products} /> : !stock.error && <SkeletonRows count={6} />}
        </Section>
      ) : (
        <Section id="i2" title="البضاعة المستلمة في المخزن" hint="استلامات المخزن المعتمدة، الأحدث أولًا. اضغط على أي استلام لرؤية أصنافه.">
          <ReceivedHistory token={token} />
        </Section>
      )}
    </div>
  );
}

// ── Brands ribbon: the company and its two brands, with this period's
// numbers. Cards rise in one after another when the dashboard opens; the
// figures come from the same overview data as the tab below (cached, no
// extra reads).
function BrandRibbon({ token, range }) {
  const { data } = useGet(token, `/api/executive/overview?from=${range.from}&to=${range.to}`, ["orders_car1", "orders_car2"]);
  const g = Object.fromEntries((data?.groups || []).map((x) => [x.id, x]));
  const total = data?.totals?.units;
  const Fig = ({ value, sub }) => (
    <p className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
      <span className="dn font-display fig-sm font-bold">{value == null ? "—" : fmt(value)}</span>
      <span className="text-xs opacity-80">{sub}</span>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mahgoub.png" alt="محجوب أولاد الغذائية" className="brand-logo-pop h-[76px] md:h-[92px] w-auto shrink-0" />
        <div className="min-w-0 text-ink">
          <p className="text-[13px] font-semibold text-muted">إجمالي المبيعات في الفترة</p>
          <Fig value={total} sub="وحدة" />
          <p className="text-xs text-muted mt-0.5">{data ? `${fmt(data.totals.invoices)} فاتورة` : " "}</p>
        </div>
      </div>

      <div className="brand-in d2 relative overflow-hidden rounded-[1.25rem] p-4 md:p-5 flex flex-col gap-3 text-white min-w-0" style={{ background: "linear-gradient(140deg, rgb(142 42 44) 0%, rgb(112 30 34) 100%)", boxShadow: "0 14px 30px -18px rgb(142 42 44 / 0.7)" }}>
        <div className="flex items-start justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/alwafi.png" alt="الوافي" className="brand-logo-pop h-[54px] md:h-[64px] w-auto drop-shadow" />
          {g.alwafi && <span className="dn text-sm font-bold rounded-full px-2.5 h-7 flex items-center" style={{ background: "rgb(240 176 48)", color: "rgb(90 20 22)" }}>{pctText(g.alwafi.share)}</span>}
        </div>
        <Fig value={g.alwafi?.units} sub="وحدة — طحنية وطحينة" />
        <Bar share={g.alwafi?.share} color="rgb(240 176 48)" track="rgb(255 255 255 / 0.18)" />
      </div>

      <div className="brand-in d3 relative overflow-hidden rounded-[1.25rem] p-4 md:p-5 flex flex-col gap-3 text-white min-w-0" style={{ background: "linear-gradient(140deg, rgb(247 150 40) 0%, rgb(232 96 20) 100%)", boxShadow: "0 14px 30px -18px rgb(232 96 20 / 0.7)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/chipsiano.webp" alt="" aria-hidden="true" className="brand-logo-pop absolute -bottom-3 end-[-14px] h-[118px] md:h-[138px] w-auto opacity-95 pointer-events-none" style={{ maskImage: "linear-gradient(to top, transparent 0%, black 22%)", WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 22%)" }} />
        <div className="relative flex items-start justify-between gap-2 pe-[72px] md:pe-[88px]">
          <p className="font-display text-xl md:text-2xl font-extrabold tracking-wide" style={{ textShadow: "0 2px 0 rgb(150 50 0 / 0.35)" }} lang="en" data-no-translate>CHIPSIANO</p>
        </div>
        <div className="relative pe-[72px] md:pe-[88px] flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Fig value={g.snacks?.units} sub="وحدة — شيبسيانو" />
            {g.snacks && <span className="dn text-sm font-bold rounded-full px-2.5 h-7 flex items-center bg-white/90" style={{ color: "rgb(190 70 10)" }}>{pctText(g.snacks.share)}</span>}
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
  const opts = (o) => new Intl.DateTimeFormat(loc, { timeZone: "Africa/Khartoum", numberingSystem: "latn", ...o }).format(now);
  return (
    <div className="flex md:flex-col items-center md:items-end justify-between gap-3 rounded-2xl bg-white/10 backdrop-blur px-4 py-3 md:px-5 md:py-4 border border-white/15 md:min-w-[200px]" data-no-translate>
      <div className="md:text-end">
        <p className="text-xs text-white/75">{opts({ weekday: "long" })}</p>
        <p className="font-display text-lg md:text-xl font-bold text-white leading-tight">{opts({ day: "numeric", month: "long" })}</p>
      </div>
      <p className="text-sm text-white/80 num">{opts({ year: "numeric" })}</p>
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
        <header className="exec-hero relative z-[1] overflow-hidden rounded-3xl px-5 py-6 md:px-8 md:py-7 text-white">
          <span aria-hidden="true" className="exec-hero-orb exec-hero-orb-1" />
          <span aria-hidden="true" className="exec-hero-orb exec-hero-orb-2" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mahgoub-mark-white.png" alt="" aria-hidden="true" className="exec-watermark" />
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
              <span className="text-[12px] sm:text-sm leading-tight text-center whitespace-normal">{t.label}</span>
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
