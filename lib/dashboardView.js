// Turns the dashboard API responses into what each section draws. Pure
// functions — no React, no network — so shares, scales and ordering can be
// checked without a browser.

// Keeps a number and its % / unit together inside Arabic text (otherwise
// the bidi algorithm can reorder "58%" to "%58" next to Arabic words).
const iso = (s) => "\u2066" + s + "\u2069";
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
// SDG amounts: thousands separators, no forced decimals.
const fmtM = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const p0 = (x) => iso(Math.round(x) + "%");
const p1 = (x) => iso((Math.round(x * 10) / 10).toFixed(1) + "%");
const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "K" : String(Math.round(v)));
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const V = (name, alpha) => (alpha == null ? `rgb(var(--d-${name}))` : `rgb(var(--d-${name}) / ${alpha})`);
const UNIT = "وحدة";

const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
const { locale } = require("./langState");
const dateFmt = (d, o) => new Date(d).toLocaleDateString(locale(), { calendar: "gregory", numberingSystem: "latn", timeZone: "Africa/Khartoum", ...o });

// Two shades per group (a dark and a light one) so products in a group stay
// distinguishable. Slots are defined in styles/globals.css under .dash.
const GROUP_SLOT = { alwafi: 1, snacks: 3, other: 5 };
function withColors(products) {
  const seen = {};
  return products.map((p) => {
    const i = (seen[p.group.id] = (seen[p.group.id] ?? -1) + 1);
    const slot = (GROUP_SLOT[p.group.id] || 5) + (i % 2);
    return { ...p, color: { bg: V("p" + slot), ink: V("p" + slot + "-i") } };
  });
}
const visible = (products) => withColors(products).filter((p) => p.active || p.w.qty + p.r.qty > 0);

function deltaOf(value, days) {
  if (value == null) return null;
  return { text: iso((value >= 0 ? "+" : "−") + Math.abs(value).toFixed(1) + "%") + " " + (days === 1 ? "عن اليوم السابق" : "عن الفترة السابقة"), up: value >= 0 };
}

/** Headline units: total, wholesale, retail — with the Alwafi / snacks split. */
function buildKpis(data) {
  const prods = visible(data.products);
  const W = data.totals.w.qty, R = data.totals.r.qty, T = W + R, ws = pct(W, T), rs = T ? 100 - ws : 0;
  const days = data.period.days;
  const groups = (get, total) => [...new Set(prods.map((p) => p.group.id))].map((id) => {
    const list = prods.filter((p) => p.group.id === id);
    const qty = sum(list.map(get));
    return { id, label: list[0].group.label, qty: fmt(qty), share: p0(pct(qty, total)), w: pct(qty, total), color: V("p" + (GROUP_SLOT[id] || 5)) };
  });
  const d = data.deltas || {};
  return [
    { key: "t", title: "إجمالي الوحدات", fill: V("tot"), fillInk: V("toti"), ring: `conic-gradient(${V("w")} 0 ${ws}%, ${V("r")} ${ws}% 100%)`, total: fmt(T),
      sub: [{ label: "جملة", value: p0(ws), color: V("w") }, { label: "تجزئة", value: p0(rs), color: V("r") }], delta: deltaOf(d.t, days), groups: groups((p) => p.w.qty + p.r.qty, T) },
    { key: "w", title: "وحدات الجملة", fill: V("w"), fillInk: V("w-i"), ring: `conic-gradient(${V("w")} 0 ${ws}%, ${V("ln")} ${ws}% 100%)`, total: fmt(W),
      sub: [{ label: "من الإجمالي", value: p0(ws), color: V("w") }], delta: deltaOf(d.w, days), groups: groups((p) => p.w.qty, W) },
    { key: "r", title: "وحدات التجزئة", fill: V("r"), fillInk: V("r-i"), ring: `conic-gradient(${V("r")} 0 ${rs}%, ${V("ln")} ${rs}% 100%)`, total: fmt(R),
      sub: [{ label: "من الإجمالي", value: p0(rs), color: V("r") }], delta: deltaOf(d.r, days), groups: groups((p) => p.r.qty, R) },
  ];
}

/**
 * The item table, in units or SDG, biggest first. For each product:
 * its share of all wholesale, of all retail, of the grand total — and how
 * its own sales split between the two channels.
 */
function buildTable(data, unit) {
  const prods = visible(data.products);
  const wv = (p) => (unit === "qty" ? p.w.qty : p.w.sdg), rv = (p) => (unit === "qty" ? p.r.qty : p.r.sdg);
  const show = (v) => (unit === "qty" ? fmt(v) : compact(v));
  const A = sum(prods.map(wv)), B = sum(prods.map(rv)), G = A + B;
  const rows = prods.map((p) => {
    const a = wv(p), b = rv(p), t = a + b;
    return {
      id: p.id, name: p.name, group: p.group.label, dot: p.color.bg, _t: t,
      w: show(a), wCap: `${p1(pct(a, A))} من الجملة`,
      r: show(b), rCap: `${p1(pct(b, B))} من التجزئة`,
      total: show(t), tCap: `${p1(pct(t, G))} من الإجمالي`, shareW: pct(t, G),
      wMix: p0(pct(a, t)), rMix: p0(t ? 100 - pct(a, t) : 0), wFlex: Math.max(a, 0.0001), rFlex: Math.max(b, 0.0001),
    };
  }).sort((x, y) => y._t - x._t).map((x, i) => ({ ...x, top: i === 0 && x._t > 0 }));
  return {
    rows, unitLabel: unit === "qty" ? UNIT : "SDG",
    total: { w: show(A), wCap: `${p1(pct(A, G))} من الإجمالي`, r: show(B), rCap: `${p1(pct(B, G))} من الإجمالي`, total: show(G), wMix: p0(pct(A, G)), rMix: p0(G ? 100 - pct(A, G) : 0), wFlex: Math.max(A, 0.0001), rFlex: Math.max(B, 0.0001) },
  };
}

/** Sales and margin in SDG, split wholesale / retail. */
function buildMoney(data) {
  const w = data.totals.w, r = data.totals.r, days = data.period.days, d = data.deltas || {};
  const mk = (title, a, b, extra) => ({ title, total: fmtM(a + b), aAmt: fmtM(a), bAmt: fmtM(b), ap: p1(pct(a, a + b)), bp: p1(pct(b, a + b)), af: Math.max(a, 0.0001), bf: Math.max(b, 0.0001), ...extra });
  const sales = w.sdg + r.sdg, margin = w.margin + r.margin;
  return [
    mk("إجمالي المبيعات", w.sdg, r.sdg, { delta: deltaOf(d.sales, days) }),
    mk("هامش التشغيل", w.margin, r.margin, {
      pill: `هامش ${p1(pct(margin, sales))}`,
      delta: deltaOf(d.margin, days),
      aSub: `هامش ${p1(pct(w.margin, w.sdg))} من مبيعات الجملة`,
      bSub: `هامش ${p1(pct(r.margin, r.sdg))} من مبيعات التجزئة`,
      note: "محسوب من الفواتير الحالية، وقد يتغير إذا عُدّلت فاتورة أو أُلغيت.",
    }),
  ];
}

function buildInvoices(data) {
  const w = data.totals.w, r = data.totals.r;
  return { total: fmt(w.invoices + r.invoices), w: fmt(w.invoices), r: fmt(r.invoices), wf: Math.max(w.invoices, 0.0001), rf: Math.max(r.invoices, 0.0001),
    wAvg: iso(fmtM(w.avgInvoice) + " SDG"), rAvg: iso(fmtM(r.avgInvoice) + " SDG") };
}

const SHADE = [1, 0.84, 0.7, 0.58, 0.47, 0.38];
/** Customer concentration for one channel (drawn in that channel's colour). */
function buildChart(c, title, colorName, softName) {
  const head = c.top[0] ? c.top[0].share : 0;
  const top = c.top.map((x, i) => ({ rank: String(i + 1), name: x.name, pct: p1(x.share), barW: head ? (x.share / head) * 100 : 0, cum: p0(x.cum), op: SHADE[i], band: i < 3 ? V(softName) : "transparent" }));
  const rows = c.others ? [...top, { rank: "", name: `آخرون (${c.others.count})`, pct: p1(c.others.share), barW: head ? (c.others.share / head) * 100 : 0, cum: p0(100), op: 1, band: "transparent", neutral: true }] : top;
  const strip = [...c.top.map((x, i) => ({ f: Math.max(x.share, 0.0001), op: SHADE[i], neutral: false })), ...(c.others ? [{ f: Math.max(c.others.share, 0.0001), op: 1, neutral: true }] : [])];
  const level = c.top3 >= 60 ? { label: "تركّز مرتفع", tone: "slate" } : c.top3 >= 45 ? { label: "تركّز متوسط", tone: "navy" } : { label: "مبيعات موزّعة", tone: "green" };
  return { title, colorName, empty: c.count === 0, count: c.count, top3: p0(c.top3), level, strip, rows };
}

const LOCATIONS = [
  { key: "car1", title: "سيارة الجملة", mv: "w", inLabel: "حُمّل في الفترة", outLabel: "بيع في الفترة" },
  { key: "car2", title: "سيارة التجزئة", mv: "r", inLabel: "حُمّل في الفترة", outLabel: "بيع في الفترة" },
  { key: "depot", title: "المخزن الرئيسي", mv: "depot", inLabel: "استلام في الفترة", outLabel: "خرج في الفترة" },
];
/** Current balance per location (not filtered by date) + the period's movement. */
function buildStock(data) {
  const prods = withColors(data.products).filter((p) => p.active);
  return LOCATIONS.map((loc) => {
    const vals = prods.map((p) => p.stock[loc.key] || 0);
    const total = sum(vals), max = Math.max(1, ...vals);
    let acc = 0;
    const stops = prods.map((p, i) => { const s = acc; acc += pct(vals[i], total); return `${p.color.bg} ${s}% ${acc}%`; });
    const m = data.movement[loc.mv];
    return {
      key: loc.key, title: loc.title, total: fmt(total),
      donut: total ? `conic-gradient(${stops.join(", ")})` : `conic-gradient(${V("ln")} 0 100%)`,
      items: prods.map((p, i) => ({ id: p.id, name: p.name, qty: fmt(vals[i]), color: p.color.bg, barW: (vals[i] / max) * 100, low: loc.key === "depot" && p.lowDepot })),
      inLabel: loc.inLabel, outLabel: loc.outLabel, inQty: "+" + fmt(m.in), outQty: "−" + fmt(m.out),
    };
  });
}

const TREND_KINDS = [
  { id: "day", label: "يومي", span: "آخر 30 يومًا", per: "اليوم" },
  { id: "week", label: "أسبوعي", span: "آخر 12 أسبوعًا", per: "الأسبوع" },
  { id: "month", label: "شهري", span: "آخر 12 شهرًا", per: "الشهر" },
];
/** Trend chart points, oldest first, with axis labels and tooltip titles. */
function buildTrend(trend) {
  const kind = trend.kind;
  const points = trend.buckets.map((b) => ({
    w: b.w, r: b.r, t: b.w + b.r,
    label: kind === "month" ? dateFmt(b.from, { month: "short" }) : dateFmt(b.from, { day: "numeric", month: "short" }),
    tip: kind === "month" ? dateFmt(b.from, { month: "long", year: "numeric" }) : kind === "week" ? "أسبوع يبدأ " + dateFmt(b.from, { day: "numeric", month: "long" }) : dateFmt(b.from, { weekday: "long", day: "numeric", month: "long" }),
  }));
  const total = sum(points.map((p) => p.t));
  const meta = TREND_KINDS.find((k) => k.id === kind) || TREND_KINDS[0];
  return { kind, points, total: fmt(total), avg: fmt(points.length ? total / points.length : 0), span: meta.span, per: meta.per };
}

/** A "nice" axis: max and step on the 1-2-5 ladder, whole units only. */
function niceScale(maxV, ticks = 4) {
  const raw = Math.max(1, maxV) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag);
  return { max: step * Math.max(1, Math.ceil(maxV / step)), step };
}

function rangeText(p) {
  if (!p) return "";
  if (p.fromYmd === p.toYmd) return dateFmt(p.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `من ${dateFmt(p.from, { day: "numeric", month: "long" })} إلى ${dateFmt(p.to, { day: "numeric", month: "long", year: "numeric" })}`;
}

function buildView(data, unit) {
  return {
    kpis: buildKpis(data), table: buildTable(data, unit), money: buildMoney(data), invoices: buildInvoices(data),
    charts: [buildChart(data.customers.w, "العملاء — الجملة", "w", "ws"), buildChart(data.customers.r, "العملاء — التجزئة", "r", "rs")],
    stock: buildStock(data),
  };
}

module.exports = { UNIT, TREND_KINDS, buildView, buildTrend, niceScale, rangeText, todayYmd, V, fmt, fmtM };
