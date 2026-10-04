// Turns the /api/dashboard/summary response into what each dashboard
// section draws. Pure functions — no React, no network — so the shares,
// sizes and ordering can be checked without a browser.

// Keeps a number and its % / unit together inside Arabic text (otherwise the
// bidi algorithm can reorder "58%" to "%58" next to Arabic words).
const iso = (s) => "\u2066" + s + "\u2069";
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const p0 = (x) => iso(Math.round(x) + "%");
const p1 = (x) => iso((Math.round(x * 10) / 10).toFixed(1) + "%");
const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "K" : String(Math.round(v)));
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const V = (name, alpha) => (alpha == null ? `rgb(var(--d-${name}))` : `rgb(var(--d-${name}) / ${alpha})`);

const PERIODS = [
  { id: "today", label: "اليوم", vs: "عن أمس" },
  { id: "yesterday", label: "أمس", vs: "عن اليوم السابق" },
  { id: "wtd", label: "منذ بداية الأسبوع", vs: "عن الأسبوع الماضي" },
  { id: "mtd", label: "منذ بداية الشهر", vs: "عن الشهر الماضي" },
  { id: "all", label: "كل المبيعات منذ بدء التشغيل", vs: "" },
];

// Two shades per group, so the two products in a group stay distinguishable
// (a dark and a light one). Slots live in styles/globals.css under .dash.
const GROUP_SLOT = { alwafi: 1, snacks: 3, other: 5 };
function productColor(groupId, indexInGroup) {
  const slot = (GROUP_SLOT[groupId] || 5) + (indexInGroup % 2);
  return { bg: V("p" + slot), ink: V("p" + slot + "-i") };
}

function withColors(products) {
  const seen = {};
  return products.map((p) => {
    const i = (seen[p.group.id] = (seen[p.group.id] ?? -1) + 1);
    return { ...p, color: productColor(p.group.id, i) };
  });
}

function deltaOf(value, vs) {
  if (value == null) return null;
  const text = iso((value >= 0 ? "+" : "−") + Math.abs(value).toFixed(1) + "%") + (vs ? " " + vs : "");
  return { text, up: value >= 0 };
}

/** The three bubbles: total, wholesale, retail. */
function buildPanels(data, vs) {
  const prods = withColors(data.products).filter((p) => p.active || p.w.qty + p.r.qty > 0);
  const W = data.totals.w.qty, R = data.totals.r.qty, T = W + R;
  const wShare = pct(W, T);
  const groups = (get, total) => {
    const ids = [...new Set(prods.map((p) => p.group.id))];
    return ids.map((id) => {
      const list = prods.filter((p) => p.group.id === id);
      const qty = sum(list.map(get));
      return { id, label: list[0].group.label, qty, share: pct(qty, total), color: V("p" + (GROUP_SLOT[id] || 5)) };
    });
  };
  const sats = (get, total) => prods.map((p) => {
    const share = pct(get(p), total);
    return { id: p.id, name: p.name, qty: get(p), share, d: Math.round(Math.max(48, Math.min(88, 40 + share * 1.35))), color: p.color };
  });
  const make = (key, title, fill, fillInk, ring, caption, value, sub, get, d) => ({
    key, title, fill, fillInk, ring, caption, value, sub, delta: deltaOf(d, vs), sats: sats(get, value), groups: groups(get, value),
  });
  return [
    make("t", "إجمالي المبيعات", V("tot"), V("toti"), `conic-gradient(${V("w")} 0 ${wShare}%, ${V("r")} ${wShare}% 100%)`, "جملة + تجزئة", T,
      `جملة ${p0(wShare)} · تجزئة ${p0(T ? 100 - wShare : 0)}`, (p) => p.w.qty + p.r.qty, data.deltas && data.deltas.t),
    make("w", "مبيعات الجملة", V("w"), V("w-i"), `conic-gradient(${V("w")} 0 ${wShare}%, ${V("ln")} ${wShare}% 100%)`, "جملة", W,
      `${p0(wShare)} من إجمالي المبيعات`, (p) => p.w.qty, data.deltas && data.deltas.w),
    make("r", "مبيعات التجزئة", V("r"), V("r-i"), `conic-gradient(${V("r")} 0 ${T ? 100 - wShare : 0}%, ${V("ln")} ${T ? 100 - wShare : 0}% 100%)`, "تجزئة", R,
      `${p0(T ? 100 - wShare : 0)} من إجمالي المبيعات`, (p) => p.r.qty, data.deltas && data.deltas.r),
  ].map((x) => ({ ...x, value: undefined, total: x.value }));
}

/** The item table, in cartons or SDG. Sorted by total, biggest first. */
function buildTable(data, unit) {
  const prods = withColors(data.products).filter((p) => p.active || p.w.qty + p.r.qty > 0);
  const wv = (p) => (unit === "qty" ? p.w.qty : p.w.sdg), rv = (p) => (unit === "qty" ? p.r.qty : p.r.sdg);
  const show = (v) => (unit === "qty" ? fmt(v) : compact(v));
  const grand = sum(prods.map((p) => wv(p) + rv(p)));
  const rows = prods.map((p) => {
    const a = wv(p), b = rv(p), t = a + b;
    return { id: p.id, name: p.name, group: p.group.label, dot: p.color.bg, w: show(a), r: show(b), wPct: p1(pct(a, t)), rPct: p1(pct(b, t)),
      wFlex: Math.max(a, 0.0001), rFlex: Math.max(b, 0.0001), total: show(t), share: p1(pct(t, grand)), shareW: pct(t, grand), _t: t };
  }).sort((x, y) => y._t - x._t).map((x, i) => ({ ...x, top: i === 0 && x._t > 0 }));
  const A = sum(prods.map(wv)), B = sum(prods.map(rv));
  return { rows, total: { w: show(A), r: show(B), wPct: p1(pct(A, A + B)), rPct: p1(pct(B, A + B)), wFlex: Math.max(A, 0.0001), rFlex: Math.max(B, 0.0001), total: show(A + B) }, unitLabel: unit === "qty" ? "كرتونة" : "SDG" };
}

/** Sales and margin in SDG, split wholesale / retail. */
function buildMoney(data, vs) {
  const w = data.totals.w, r = data.totals.r;
  const mk = (title, a, b, extra) => ({ title, total: fmt(a + b), aAmt: fmt(a), bAmt: fmt(b), ap: p1(pct(a, a + b)), bp: p1(pct(b, a + b)), af: Math.max(a, 0.0001), bf: Math.max(b, 0.0001), ...extra });
  const sales = w.sdg + r.sdg, margin = w.margin + r.margin;
  return [
    mk("إجمالي المبيعات", w.sdg, r.sdg, { delta: deltaOf(data.deltas && data.deltas.sales, vs) }),
    mk("هامش التشغيل", w.margin, r.margin, {
      pill: "هامش " + p1(pct(margin, sales)),
      delta: deltaOf(data.deltas && data.deltas.margin, vs),
      aSub: "هامش " + p1(pct(w.margin, w.sdg)) + " من مبيعات الجملة",
      bSub: "هامش " + p1(pct(r.margin, r.sdg)) + " من مبيعات التجزئة",
      note: "محسوب من الفواتير الحالية، وقد يتغير إذا عُدّلت فاتورة أو أُلغيت.",
    }),
  ];
}

function buildInvoices(data) {
  const w = data.totals.w, r = data.totals.r;
  return { total: fmt(w.invoices + r.invoices), w: fmt(w.invoices), r: fmt(r.invoices), wf: Math.max(w.invoices, 0.0001), rf: Math.max(r.invoices, 0.0001),
    wAvg: iso(fmt(w.avgInvoice) + " SDG"), rAvg: iso(fmt(r.avgInvoice) + " SDG") };
}

const SHADE = [1, 0.84, 0.7, 0.58, 0.47, 0.38];
/** Customer concentration chart for one channel. */
function buildChart(c, title, colorName, softName) {
  const color = V(colorName);
  const top = c.top.map((x, i) => ({ rank: String(i + 1), name: x.name, pct: p1(x.share), barW: c.top[0].share ? (x.share / c.top[0].share) * 100 : 0, cum: p0(x.cum), op: SHADE[i], band: i < 3 ? V(softName) : "transparent" }));
  const rows = c.others ? [...top, { rank: "", name: `آخرون (${c.others.count})`, pct: p1(c.others.share), barW: c.top[0].share ? (c.others.share / c.top[0].share) * 100 : 0, cum: p0(100), op: 0.45, band: "transparent", neutral: true }] : top;
  const strip = [...c.top.map((x, i) => ({ f: Math.max(x.share, 0.0001), op: SHADE[i], neutral: false })), ...(c.others ? [{ f: Math.max(c.others.share, 0.0001), op: 0.35, neutral: true }] : [])];
  const level = c.top3 >= 60 ? { label: "تركّز مرتفع", tone: "amber" } : c.top3 >= 45 ? { label: "تركّز متوسط", tone: "navy" } : { label: "مبيعات موزّعة", tone: "green" };
  return { title, color, empty: c.count === 0, count: c.count, top3: p0(c.top3), level, strip, rows };
}

const LOCATIONS = [
  { key: "car1", title: "سيارة الجملة", mv: "w", inLabel: "حُمّل في الفترة", outLabel: "بيع في الفترة" },
  { key: "car2", title: "سيارة التجزئة", mv: "r", inLabel: "حُمّل في الفترة", outLabel: "بيع في الفترة" },
  { key: "depot", title: "المخزن الرئيسي", mv: "depot", inLabel: "استلام في الفترة", outLabel: "خرج في الفترة" },
];
/** Current balance per location (not affected by the period) + that period's movement. */
function buildStock(data) {
  const prods = withColors(data.products).filter((p) => p.active);
  return LOCATIONS.map((loc) => {
    const vals = prods.map((p) => p.stock[loc.key] || 0);
    const total = sum(vals), max = Math.max(1, ...vals);
    let acc = 0;
    const stops = prods.map((p, i) => { const s = acc; acc += pct(vals[i], total); return `${p.color.bg} ${s}% ${acc}%`; });
    const m = data.movement[loc.mv];
    return {
      key: loc.key, title: loc.title, total: fmt(total), empty: total === 0,
      donut: total ? `conic-gradient(${stops.join(", ")})` : `conic-gradient(${V("ln")} 0 100%)`,
      items: prods.map((p, i) => ({ id: p.id, name: p.name, qty: fmt(vals[i]), color: p.color.bg, barW: (vals[i] / max) * 100, low: loc.key === "depot" && p.lowDepot })),
      inLabel: loc.inLabel, outLabel: loc.outLabel, inQty: "+" + fmt(m.in), outQty: "−" + fmt(m.out),
    };
  });
}

function buildView(data, unit) {
  const vs = (PERIODS.find((p) => p.id === data.period.id) || {}).vs || "";
  return {
    panels: buildPanels(data, vs), table: buildTable(data, unit), money: buildMoney(data, vs), invoices: buildInvoices(data),
    charts: [buildChart(data.customers.w, "العملاء — الجملة", "w", "ws"), buildChart(data.customers.r, "العملاء — التجزئة", "r", "rs")],
    stock: buildStock(data),
  };
}

function rangeText(period, p) {
  const f = (d, o) => new Date(d).toLocaleDateString("ar-EG", { calendar: "gregory", numberingSystem: "latn", timeZone: "Africa/Khartoum", ...o });
  if (p.id === "today") return f(p.to, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (p.id === "yesterday") return f(p.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (p.id === "all" || !p.from) return "منذ بدء التشغيل حتى اليوم";
  return `من ${f(p.from, { day: "numeric", month: "long" })} إلى ${f(p.to, { day: "numeric", month: "long", year: "numeric" })}`;
}

module.exports = { PERIODS, buildView, rangeText, V };
