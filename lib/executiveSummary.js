// Figures for the executive's view-only dashboard (/executive). Computed on
// the server from the same invoices and stock as the manager's dashboard, so
// the two never disagree — but shaped for the executive:
//
//   - money is at COST: each sold line × the unit cost recorded in inventory
//     when it was sold (lib/marginCalc.js uses the same rule), falling back
//     to the product's current average cost for old lines without one.
//     Selling prices and margin are never sent to this role.
//   - units count paid goods only; free samples and cancelled invoices are
//     excluded everywhere (same as the manager's dashboard).
//
// Three builders, one per dashboard tab.

const { adminDb } = require("./firebaseAdmin");
const { rangeFromDates, fetchOrders, fetchClientNames, channelOf, groupOf } = require("./dashboardSummary");
const { ROUTES } = require("./roles");

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);
const CHANNEL_ROUTE = { w: "car1", r: "car2" };

// The executive's names for the two product families.
const EXEC_GROUP_LABELS = { alwafi: "الوافي", snacks: "شيبسيانو", other: "أخرى" };

function periodOf(range) {
  return { from: range.from.toISOString(), to: range.to.toISOString(), fromYmd: range.fromYmd, toYmd: range.toYmd, days: range.days };
}

async function productMeta() {
  const snap = await adminDb.collection("products").get();
  const meta = {};
  snap.docs.forEach((d) => (meta[d.id] = { id: d.id, ...d.data() }));
  return meta;
}

/** Tab 1 — operations summary. */
async function buildOverview({ from, to } = {}, now = new Date()) {
  const range = rangeFromDates(from, to, now);
  const [orders, meta] = await Promise.all([fetchOrders(range), productMeta()]);

  const ch = { w: { invoices: 0, units: 0, cost: 0 }, r: { invoices: 0, units: 0, cost: 0 } };
  const byProduct = {};
  let uncostedUnits = 0;

  for (const o of orders) {
    const c = channelOf(o);
    if (!c || o.status === "cancelled") continue;
    ch[c].invoices += 1;
    for (const it of o.items || []) {
      if (it.freeSample) continue;
      const qty = Number(it.qty) || 0;
      if (!qty) continue;
      ch[c].units += qty;
      const m = meta[it.productId] || {};
      const row = (byProduct[it.productId] = byProduct[it.productId] || {
        id: it.productId,
        name: m.name || it.name || it.productId,
        unit: m.unit || "",
        group: groupOf(m.category, m.name || it.name).id,
        w: 0,
        r: 0,
      });
      row[c] += qty;
      const unitCost = it.unitCost != null ? Number(it.unitCost) : typeof m.avgCost === "number" ? m.avgCost : null;
      if (unitCost == null) uncostedUnits += qty;
      else ch[c].cost += unitCost * qty;
    }
  }

  const totalUnits = ch.w.units + ch.r.units;
  const products = Object.values(byProduct)
    .map((p) => ({ ...p, units: p.w + p.r, share: pct(p.w + p.r, totalUnits) }))
    .sort((a, b) => b.units - a.units);

  const groupMap = {};
  products.forEach((p) => {
    groupMap[p.group] = (groupMap[p.group] || 0) + p.units;
  });
  const groups = ["alwafi", "snacks", "other"]
    .filter((g) => groupMap[g] || g !== "other")
    .map((g) => ({ id: g, label: EXEC_GROUP_LABELS[g], units: groupMap[g] || 0, share: pct(groupMap[g] || 0, totalUnits) }));

  const channel = (c) => ({
    route: CHANNEL_ROUTE[c],
    invoices: ch[c].invoices,
    units: ch[c].units,
    unitShare: pct(ch[c].units, totalUnits),
    costValue: round2(ch[c].cost),
  });

  return {
    period: periodOf(range),
    totals: {
      units: totalUnits,
      invoices: ch.w.invoices + ch.r.invoices,
      costValue: round2(ch.w.cost + ch.r.cost),
      uncostedUnits,
    },
    wholesale: channel("w"),
    retail: channel("r"),
    groups,
    products,
  };
}

/** Tab 2 — customers and routes. */
async function buildCustomers({ from, to } = {}, now = new Date()) {
  const range = rangeFromDates(from, to, now);
  const clients = adminDb.collection("clients");
  // Aggregation queries: one cheap read per 1,000 clients, no documents downloaded.
  const countOf = async (q) => (await q.count().get()).data().count;
  const [orders, ...counts] = await Promise.all([
    fetchOrders(range),
    ...ROUTES.flatMap((r) => [countOf(clients.where("route", "==", r)), countOf(clients.where("route", "==", r).where("active", "==", false))]),
  ]);

  const perClient = new Map();
  const perRoute = Object.fromEntries(ROUTES.map((r) => [r, { invoices: 0, units: 0, buyers: new Set() }]));
  let totalUnits = 0;
  for (const o of orders) {
    if (o.status === "cancelled" || !perRoute[o.route]) continue;
    const units = (o.items || []).filter((it) => !it.freeSample).reduce((a, it) => a + (Number(it.qty) || 0), 0);
    totalUnits += units;
    const pr = perRoute[o.route];
    pr.invoices += 1;
    pr.units += units;
    if (o.clientId) pr.buyers.add(String(o.clientId));
    if (!o.clientId) continue;
    const key = String(o.clientId);
    const row = perClient.get(key) || { id: key, route: o.route, invoices: 0, units: 0 };
    row.invoices += 1;
    row.units += units;
    perClient.set(key, row);
  }

  const top = [...perClient.values()].sort((a, b) => b.units - a.units || b.invoices - a.invoices).slice(0, 10);
  const names = await fetchClientNames(top.map((t) => t.id));

  const registered = Object.fromEntries(ROUTES.map((r, i) => [r, { total: counts[i * 2], inactive: counts[i * 2 + 1] }]));
  const totalRegistered = ROUTES.reduce((a, r) => a + registered[r].total, 0);

  return {
    period: periodOf(range),
    registered: {
      total: totalRegistered,
      routes: ROUTES.map((r) => ({ route: r, ...registered[r], share: pct(registered[r].total, totalRegistered) })),
    },
    routes: ROUTES.map((r) => ({
      route: r,
      invoices: perRoute[r].invoices,
      units: perRoute[r].units,
      buyers: perRoute[r].buyers.size,
      reach: pct(perRoute[r].buyers.size, registered[r].total - registered[r].inactive),
    })),
    totalUnits,
    top: top.map((t, i) => ({ rank: i + 1, ...t, name: names[t.id] || null, share: pct(t.units, totalUnits) })),
  };
}

/** Tab 3 — stock now (quantities only, no prices or costs). */
async function buildStock() {
  const meta = await productMeta();
  const products = Object.values(meta)
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit || "",
      group: groupOf(p.category, p.name).id,
      lowStock: Boolean(p.minStock > 0 && (p.stock?.depot ?? 0) <= p.minStock),
      stock: Object.fromEntries(["depot", ...ROUTES, "damaged"].map((k) => [k, Number(p.stock?.[k]) || 0])),
    }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  return { products };
}

const DEFAULT_WINDOW_DAYS = 90;
const PAGE_SIZE = 50;

/**
 * Tab 3 — goods received into the warehouse (approved receipts only),
 * newest first, paged. Supplier prices are removed.
 */
async function receivedHistory({ from, to, cursor } = {}) {
  let q = adminDb.collection("inventoryDocs").where("type", "==", "received").orderBy("createdAt", "desc");
  const f = from ? new Date(`${from}T00:00:00+02:00`) : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 3600e3);
  if (isNaN(f)) throw Object.assign(new Error("تاريخ غير صالح"), { statusCode: 400 });
  q = q.where("createdAt", ">=", f.toISOString());
  if (to) {
    const t = new Date(`${to}T23:59:59.999+02:00`);
    if (isNaN(t)) throw Object.assign(new Error("تاريخ غير صالح"), { statusCode: 400 });
    q = q.where("createdAt", "<=", t.toISOString());
  }
  if (cursor) q = q.startAfter(String(cursor));
  const snap = await q.limit(PAGE_SIZE).get();
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const nextCursor = raw.length === PAGE_SIZE ? raw[raw.length - 1].createdAt : null;
  const docs = raw
    .filter((d) => d.status === "confirmed")
    .map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      finalizedAt: d.finalizedAt || null,
      note: d.warehouseKeeperNote || null,
      items: (d.items || []).map((it) => ({ productId: it.productId, name: it.name, qty: Number(it.qty) || 0, unit: it.unit || "" })),
      units: (d.items || []).reduce((a, it) => a + (Number(it.qty) || 0), 0),
    }));
  return { docs, nextCursor };
}

module.exports = { buildOverview, buildCustomers, buildStock, receivedHistory, EXEC_GROUP_LABELS };
