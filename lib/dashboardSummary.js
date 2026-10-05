const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { netLines } = require("./invoiceDiscount");
const { marginForOrders } = require("./marginCalc");
const { PRODUCT_GROUPS } = require("./constants");

// ─── Periods ──────────────────────────────────────────────────────────────
// Day boundaries follow Sudan's clock (UTC+2 all year), not the server's —
// Vercel runs on UTC, which would roll "today" over at 2 AM local time.
// The week starts on Saturday. Comparisons use the SAME elapsed window of
// the previous period (today so far vs. yesterday up to the same time), so
// the first hours of a day don't read as a collapse.
const DAY = 24 * 3600e3;
const startOfDay = (ymd) => new Date(`${ymd}T00:00:00+02:00`);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
function bad(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

/**
 * A from–to range of whole days on Sudan's calendar, inclusive. Defaults to
 * today. A range that reaches today stops at "now". The comparison window
 * is the same number of days immediately before, cut at the same point —
 * so a range still in progress is compared like-for-like.
 */
function rangeFromDates(fromYmd, toYmd, now = new Date()) {
  const today = businessDay(now);
  const f = fromYmd || today;
  let t = toYmd || f;
  if (!YMD.test(f) || !YMD.test(t) || isNaN(startOfDay(f)) || isNaN(startOfDay(t))) throw bad("تاريخ غير صالح");
  if (t > today) t = today;
  if (f > t) throw bad("تاريخ البداية بعد تاريخ النهاية");
  const from = startOfDay(f);
  const endOfLastDay = new Date(addDays(startOfDay(t), 1).getTime() - 1);
  const to = endOfLastDay > now ? now : endOfLastDay;
  const days = Math.round((startOfDay(t) - from) / DAY) + 1;
  return { from, to, days, fromYmd: f, toYmd: t, prev: { from: addDays(from, -days), to: addDays(to, -days) } };
}

// Time series for the trend chart: 30 days, 12 weeks (Saturday-start) or
// 12 months, ending with the current (partial) bucket.
const TREND = { day: 30, week: 12, month: 12 };
function trendBuckets(kind, now = new Date()) {
  const ymd = businessDay(now);
  const today = startOfDay(ymd);
  const out = [];
  if (kind === "month") {
    let [y, m] = ymd.split("-").map(Number);
    for (let i = 0; i < TREND.month; i++) {
      out.unshift(startOfDay(`${y}-${String(m).padStart(2, "0")}-01`));
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
  } else if (kind === "week") {
    const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
    const thisWeek = addDays(today, -((dow + 1) % 7));
    for (let i = TREND.week - 1; i >= 0; i--) out.push(addDays(thisWeek, -7 * i));
  } else {
    for (let i = TREND.day - 1; i >= 0; i--) out.push(addDays(today, -i));
  }
  return out.map((from, i) => ({ from, to: i + 1 < out.length ? out[i + 1] : null }));
}

// ─── Reads ────────────────────────────────────────────────────────────────
async function fetchOrders(range) {
  if (!range) return [];
  let q = adminDb.collection("orders");
  if (range.from) q = q.where("createdAt", ">=", range.from.toISOString());
  q = q.where("createdAt", "<=", range.to.toISOString());
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchStockDocs(range) {
  let q = adminDb.collection("inventoryDocs");
  if (range.from) q = q.where("finalizedAt", ">=", range.from.toISOString());
  q = q.where("finalizedAt", "<=", range.to.toISOString());
  const snap = await q.get();
  return snap.docs.map((d) => d.data()).filter((d) => d.status === "confirmed");
}

async function fetchClientNames(ids) {
  const names = {};
  for (let i = 0; i < ids.length; i += 200) {
    const snaps = await adminDb.getAll(...ids.slice(i, i + 200).map((id) => adminDb.collection("clients").doc(String(id))));
    snaps.forEach((s) => { if (s.exists) names[s.id] = s.data().name || s.data().storeName || null; });
  }
  return names;
}

// ─── Pure calculations ────────────────────────────────────────────────────
const sum = (a) => a.reduce((x, y) => x + y, 0);
const channelOf = (o) => (o.route === "car1" ? "w" : o.route === "car2" ? "r" : null);

function groupOf(category, name) {
  const g = PRODUCT_GROUPS.find((x) => x.categories.includes(category));
  if (g) return { id: g.id, label: g.label };
  if (/شيبس|شبس/.test(name || "")) return { id: "snacks", label: PRODUCT_GROUPS.find((x) => x.id === "snacks").label };
  return { id: "other", label: "أخرى" };
}

/**
 * Sales figures from a set of invoices. Cancelled invoices are ignored.
 * Cartons count PAID goods only — a free sample leaves the car but isn't a
 * sale. Revenue is each line's net subtotal after the invoice discount
 * (same rule as the margin and the sales report).
 */
function tally(orders) {
  const byProduct = {};
  const ch = { w: { qty: 0, sdg: 0, invoices: 0 }, r: { qty: 0, sdg: 0, invoices: 0 } };
  const customers = { w: new Map(), r: new Map() };
  for (const o of orders) {
    const c = channelOf(o);
    if (!c || o.status === "cancelled") continue;
    ch[c].invoices += 1;
    for (const it of netLines(o)) {
      const row = (byProduct[it.productId] = byProduct[it.productId] || { name: it.name, w: { qty: 0, sdg: 0 }, r: { qty: 0, sdg: 0 } });
      const sdg = Number(it.netSubtotal) || 0;
      if (!it.freeSample) {
        row[c].qty += Number(it.qty) || 0;
        ch[c].qty += Number(it.qty) || 0;
      }
      row[c].sdg += sdg;
      ch[c].sdg += sdg;
      customers[c].set(o.clientId, (customers[c].get(o.clientId) || 0) + sdg);
    }
  }
  return { byProduct, ch, customers };
}

/** Who the sales depend on: top 6 customers + everyone else, with cumulative share. */
function concentration(map, names) {
  const rows = [...map.entries()]
    .map(([id, sdg]) => ({ id, name: names[id] || `عميل ${id}`, sdg }))
    .filter((r) => r.sdg > 0)
    .sort((a, b) => b.sdg - a.sdg);
  const total = sum(rows.map((r) => r.sdg));
  const pct = (v) => (total ? (v / total) * 100 : 0);
  let cum = 0;
  const top = rows.slice(0, 6).map((r) => {
    cum += r.sdg;
    return { id: r.id, name: r.name, share: pct(r.sdg), cum: pct(cum) };
  });
  const rest = rows.slice(6);
  return {
    count: rows.length,
    top,
    others: rest.length ? { count: rest.length, share: pct(sum(rest.map((r) => r.sdg))) } : null,
    top3: pct(sum(rows.slice(0, 3).map((r) => r.sdg))),
  };
}

const change = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

async function buildSummary({ from, to } = {}, now = new Date()) {
  const range = rangeFromDates(from, to, now);
  const [orders, prevOrders, productSnap, docs] = await Promise.all([
    fetchOrders(range),
    range.prev ? fetchOrders(range.prev) : Promise.resolve(null),
    adminDb.collection("products").get(),
    fetchStockDocs(range),
  ]);

  const cur = tally(orders);
  const ordersBy = (c) => orders.filter((o) => channelOf(o) === c && o.status !== "cancelled");
  const [mW, mR] = await Promise.all([marginForOrders(ordersBy("w")), marginForOrders(ordersBy("r"))]);

  // Products: every active one (so empty ones still show), plus any inactive
  // product that actually sold in the period (so totals always add up).
  const meta = {};
  productSnap.docs.forEach((d) => (meta[d.id] = { id: d.id, ...d.data() }));
  const ids = new Set([...Object.keys(cur.byProduct), ...Object.values(meta).filter((p) => p.active !== false).map((p) => p.id)]);
  const GROUP_ORDER = { alwafi: 0, snacks: 1, other: 2 };
  const products = [...ids]
    .map((id) => {
      const m = meta[id] || {};
      const t = cur.byProduct[id] || { name: m.name, w: { qty: 0, sdg: 0 }, r: { qty: 0, sdg: 0 } };
      const name = m.name || t.name || id;
      const stock = m.stock || {};
      return {
        id, name, unit: m.unit || "", group: groupOf(m.category, name),
        w: t.w, r: t.r,
        stock: { depot: stock.depot || 0, car1: stock.car1 || 0, car2: stock.car2 || 0 },
        lowDepot: Number(m.minStock) > 0 && (stock.depot || 0) < Number(m.minStock),
        active: m.active !== false,
      };
    })
    .sort((a, b) => GROUP_ORDER[a.group.id] - GROUP_ORDER[b.group.id] || a.name.localeCompare(b.name, "ar"));

  const clientIds = [...new Set([...cur.customers.w.keys(), ...cur.customers.r.keys()])].filter(Boolean);
  const names = await fetchClientNames(clientIds);

  const sumQty = (list, type, route) => sum(list.filter((d) => d.type === type && (!route || d.route === route)).flatMap((d) => d.items || []).map((i) => Number(i.qty) || 0));
  const movement = {
    w: { in: sumQty(docs, "loading", "car1"), out: cur.ch.w.qty },
    r: { in: sumQty(docs, "loading", "car2"), out: cur.ch.r.qty },
    depot: { in: sumQty(docs, "received"), out: sumQty(docs, "loading") + sumQty(docs, "transfer") },
  };

  let deltas = null;
  if (prevOrders) {
    const prev = tally(prevOrders);
    const pm = await marginForOrders(prevOrders.filter((o) => channelOf(o) && o.status !== "cancelled"));
    deltas = {
      t: change(cur.ch.w.qty + cur.ch.r.qty, prev.ch.w.qty + prev.ch.r.qty),
      w: change(cur.ch.w.qty, prev.ch.w.qty),
      r: change(cur.ch.r.qty, prev.ch.r.qty),
      sales: change(cur.ch.w.sdg + cur.ch.r.sdg, prev.ch.w.sdg + prev.ch.r.sdg),
      margin: change(mW.margin + mR.margin, pm.margin),
    };
  }

  const totals = (c, m) => ({
    qty: cur.ch[c].qty, sdg: Math.round(cur.ch[c].sdg), margin: m.margin, marginPct: m.marginPct,
    invoices: cur.ch[c].invoices, avgInvoice: cur.ch[c].invoices ? Math.round(cur.ch[c].sdg / cur.ch[c].invoices) : 0,
  });

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), fromYmd: range.fromYmd, toYmd: range.toYmd, days: range.days },
    products,
    totals: { w: totals("w", mW), r: totals("r", mR) },
    deltas,
    customers: { w: concentration(cur.customers.w, names), r: concentration(cur.customers.r, names) },
    movement,
  };
}

async function buildTrend(kind = "day", now = new Date()) {
  if (!TREND[kind]) throw bad("نوع الفترة غير صالح");
  const buckets = trendBuckets(kind, now);
  const orders = await fetchOrders({ from: buckets[0].from, to: now });
  const out = buckets.map((b) => ({ from: b.from.toISOString(), w: 0, r: 0 }));
  const starts = buckets.map((b) => b.from.getTime());
  for (const o of orders) {
    const c = channelOf(o);
    if (!c || o.status === "cancelled") continue;
    const t = new Date(o.createdAt).getTime();
    let i = starts.length - 1;
    while (i > 0 && t < starts[i]) i--;
    if (t < starts[0]) continue;
    for (const it of o.items || []) if (!it.freeSample) out[i][c] += Number(it.qty) || 0;
  }
  return { kind, buckets: out };
}

module.exports = { rangeFromDates, trendBuckets, buildSummary, buildTrend, tally, concentration, groupOf, fetchOrders, fetchClientNames, channelOf };
