import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import StockBoard from "../../components/StockBoard";
import { DateRange, Section, TrendChart } from "../../components/SupervisorDashboard";
import { DonutChart, PieChart, BarList, Split, pctText } from "../../components/ExecCharts";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { buildTrend, rangeText, todayYmd, V, fmt } from "../../lib/dashboardView";
import { formatDate, formatDateTime, formatQty, ROUTE_LABELS_SHORT } from "../../lib/labels";

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
const GROUP_COLOR = { alwafi: V("p1"), snacks: V("p3"), other: V("p5") };
const PRODUCT_COLORS = ["p1", "p3", "p2", "p4", "p5", "p6"];
const Card = ({ className = "", children }) => <div className={`bg-white rounded-2xl shadow min-w-0 ${className}`}>{children}</div>;

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

function Stat({ label, value, unit, color, sub }) {
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: color ? V(color + "s") : "rgb(var(--gray-100))" }}>
      <div className="text-[13px] font-semibold" style={{ color: color ? V(color) : "rgb(var(--gray-600))" }}>{label}</div>
      <div className="mt-1"><span className="dn text-2xl font-bold text-ink">{value}</span>{unit && <span className="text-xs text-muted ms-1.5">{unit}</span>}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

/* ── Tab 1: ملخص العمليات ──────────────────────────────────────────────── */

function OverviewTab({ token, range }) {
  const [kind, setKind] = useState("day");
  const trend = useGet(token, `/api/dashboard/trend?bucket=${kind}`, ["orders_car1", "orders_car2"]);
  const sum = useGet(token, `/api/executive/overview?from=${range.from}&to=${range.to}`, ["orders_car1", "orders_car2"]);
  const d = sum.data;

  return (
    <div className="flex flex-col gap-12">
      <Section id="x0" title="تطور المبيعات" hint="عدد الوحدات المباعة عبر الزمن، جملة وتجزئة. مرّر المؤشر على المنحنى لرؤية أي نقطة.">
        <TrendChart trend={trend.data ? buildTrend(trend.data) : null} kind={kind} onKind={setKind} loading={trend.busy} />
      </Section>

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
                    color: V(PRODUCT_COLORS[i % PRODUCT_COLORS.length]),
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
                <div className="flex items-baseline gap-2">
                  <span className="dn font-display text-[44px] font-bold leading-none text-ink">{fmt(d.totals.invoices)}</span>
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
                <div className="flex items-baseline gap-2">
                  <span className="dn font-display text-[44px] font-bold leading-none text-ink">{fmt(d.totals.costValue)}</span>
                  <span className="text-sm text-muted">SDG</span>
                </div>
                <Split a={d.wholesale.costValue} b={d.retail.costValue} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="جملة" value={fmt(d.wholesale.costValue)} unit="SDG" color="w" sub={pctText(d.totals.costValue ? (d.wholesale.costValue / d.totals.costValue) * 100 : 0)} />
                  <Stat label="تجزئة" value={fmt(d.retail.costValue)} unit="SDG" color="r" sub={pctText(d.totals.costValue ? (d.retail.costValue / d.totals.costValue) * 100 : 0)} />
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

function CustomersTab({ token, range }) {
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
          <div className="flex items-baseline gap-2">
            <span className="dn font-display text-[44px] font-bold leading-none text-ink">{fmt(reg.total)}</span>
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
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 self-start">
        <Icon name="calendar" size={18} className="text-muted" />
        <label className="flex items-center gap-2 text-sm text-muted">من<input type="date" value={from} max={to || todayYmd()} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink" /></label>
        <label className="flex items-center gap-2 text-sm text-muted">إلى<input type="date" value={to} min={from || undefined} max={todayYmd()} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink" /></label>
        {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="h-9 px-3 rounded-lg text-sm font-semibold text-ink-soft hover:bg-surface-2">آخر 90 يومًا</button>}
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
              <div className="flex items-baseline gap-2"><span className="dn font-display text-[36px] font-bold leading-none text-ink">{fmt(totalUnits)}</span><span className="text-sm text-muted">{UNIT} · {fmt(docs.length)} مستند</span></div>
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

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function ExecutiveDashboard() {
  const router = useRouter();
  const { role, token, loading, logout } = useAuth(["executive"]);
  const tab = TABS.some((t) => t.id === router.query.tab) ? router.query.tab : "overview";
  const [range, setRange] = useState(() => ({ from: todayYmd(), to: todayYmd() }));
  const setTab = (id) => router.replace({ pathname: "/executive", query: id === "overview" ? {} : { tab: id } }, undefined, { shallow: true });

  if (loading) return <PageLoading />;
  const dated = tab !== "inventory";
  const today = todayYmd();
  const period = range.from === range.to ? { fromYmd: range.from, toYmd: range.to, from: `${range.from}T12:00:00+02:00` } : { fromYmd: range.from, toYmd: range.to, from: `${range.from}T12:00:00+02:00`, to: `${range.to}T12:00:00+02:00` };

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="dash max-w-[1320px] mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-12 md:pb-16 flex flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="text-sm text-muted m-0">{dated ? rangeText(period) : "لوحة المتابعة — للعرض فقط"}</p>
            <h1 className="font-display text-[28px] md:text-[32px] leading-tight font-bold text-ink mt-1">{TABS.find((t) => t.id === tab).label}</h1>
          </div>
          {dated && <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to: to > today ? today : to })} />}
        </header>

        <nav role="tablist" aria-label="أقسام اللوحة" className="flex gap-1 p-1 rounded-2xl bg-white shadow-sm overflow-x-auto no-scrollbar sticky top-[4.25rem] z-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-max h-11 px-4 rounded-xl text-sm flex items-center justify-center gap-2 ${tab === t.id ? "bg-accent text-on-accent font-bold" : "text-ink-soft font-medium hover:bg-surface-2"}`}
            >
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <OverviewTab token={token} range={range} />}
        {tab === "customers" && <CustomersTab token={token} range={range} />}
        {tab === "inventory" && <InventoryTab token={token} />}
      </main>
    </div>
  );
}
