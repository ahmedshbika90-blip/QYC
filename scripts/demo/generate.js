// Builds a realistic, internally consistent demo data set for مباشر:
// products, wholesale + retail clients, months of invoices, payments,
// warehouse receipts and van loadings — shaped exactly like the documents
// the app itself writes, so every screen, report and dashboard works on it.
//
// Pure function: no database access. scripts/demo/seed.js writes the result.
// The same `seed` always produces the same data (repeatable presentations).
//
// Realism built in:
//   - retail (car2) clients are on a fixed weekly route day; wholesale (car1)
//     clients order on demand, a few big orders a day;
//   - Friday is the weekend; volume grows gently over the period;
//   - a few customers buy far more than others (top-10 view is meaningful);
//   - free samples, occasional discounts, ~2% cancelled invoices;
//   - retail pays within days, wholesale on credit (aging is meaningful);
//   - stock ledger adds up: received → depot → loaded to vans → sold.

const DAY = 24 * 3600 * 1000;
const TZ_OFFSET_H = 2; // Africa/Khartoum

const { statsDocsFromOrders, logStatesFromOrders } = require("../../lib/salesStatsModel");
const { normalizeAr } = require("../../lib/arabicSearch");
const { clientBalancesFrom } = require("../../lib/clientLedgerModel");

function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = [
  { id: "demo-tahnia-plain", name: "طحنية الوافي سادة", nameEn: "Alwafi Halawa Plain", category: "طحنية", unit: "كرتونة", car1: 54000, car2: 58000, cost: 45000, w: 1.0 },
  { id: "demo-tahnia-peanut", name: "طحنية الوافي بالفول", nameEn: "Alwafi Halawa Peanut", category: "طحنية", unit: "كرتونة", car1: 56000, car2: 60000, cost: 47000, w: 0.8 },
  { id: "demo-tahnia-bucket", name: "طحنية الوافي جردل", nameEn: "Alwafi Halawa Bucket", category: "طحنية", unit: "جردل", car1: 38000, car2: 41000, cost: 31000, w: 0.55 },
  { id: "demo-tahina", name: "طحينة الوافي", nameEn: "Alwafi Tahini", category: "طحينة", unit: "كرتونة", car1: 48000, car2: 52000, cost: 40000, w: 0.6 },
  { id: "demo-chips-salt", name: "شبس شيبسيانو ملح", nameEn: "Chipsiano Salted", category: "شبس", unit: "كرتونة", car1: 21000, car2: 23500, cost: 17000, w: 1.1 },
  { id: "demo-chips-chili", name: "شبس شيبسيانو شطة", nameEn: "Chipsiano Chili", category: "شبس", unit: "كرتونة", car1: 21000, car2: 23500, cost: 17000, w: 0.9 },
  { id: "demo-chips-cheese", name: "شبس شيبسيانو جبنة", nameEn: "Chipsiano Cheese", category: "شبس", unit: "كرتونة", car1: 22000, car2: 24500, cost: 18000, w: 0.7 },
];

const FIRST = ["محمد", "أحمد", "عثمان", "عبدالله", "الطيب", "مصطفى", "إبراهيم", "يوسف", "حسن", "علي", "خالد", "عمر", "صلاح", "بابكر", "الفاتح", "معتز", "هشام", "مجدي", "عادل", "النور", "آمنة", "فاطمة", "سارة", "هبة", "إيمان"];
const MIDDLE = ["عبدالرحمن", "الحسن", "إدريس", "محجوب", "الأمين", "آدم", "موسى", "سليمان", "الصادق", "حامد", "عوض", "بشير", "الزين", "عبدالقادر", "جعفر"];
const LAST = ["أحمد", "علي", "محمد", "عثمان", "الخليفة", "حمد", "الشيخ", "نور", "إسماعيل", "الماحي", "دفع الله", "عبدالله", "الطاهر", "يعقوب", "كرار"];
const STORE_W = ["مخازن", "شركة", "مؤسسة", "توكيلات", "مجموعة"];
const STORE_R = ["بقالة", "سوبرماركت", "كافتيريا", "دكان", "ميني ماركت"];
const STORE_SUFFIX = ["النيل", "البركة", "الأمانة", "الصفا", "النور", "الخير", "الوفاء", "السلام", "الرحمة", "الهدى", "التوفيق", "الفردوس", "الريان", "الشروق", "المدينة", "الأمل", "الزهراء", "الإخلاص"];
// Delivery route (المسار) for each area — no random draw, so the seeded
// data stays exactly what it was.
const routeOfArea = (a) => (a.startsWith("أم درمان") ? "خط أم درمان" : a.startsWith("بحري") || a === "الحاج يوسف" ? "خط بحري" : a.startsWith("السوق") ? "خط السوق" : "خط الخرطوم");
const AREAS = ["الخرطوم 2", "العمارات", "الرياض", "الصحافة", "جبرة", "الكلاكلة", "الديم", "بري", "المعمورة", "الطائف", "أركويت", "أم درمان — الثورة", "أم درمان — السوق", "أم درمان — ود نوباوي", "بحري — الصافية", "بحري — شمبات", "بحري — الحلفايا", "السوق العربي", "السوق المركزي", "الحاج يوسف"];

const BANKS = [
  ["bok", 0.55],
  ["onb", 0.15],
  ["faisal", 0.15],
  ["nile", 0.15],
];

// `catalog` (optional): the company's REAL products, as stored in Firestore
// ([{ id, name, unit, category, prices: { car1, car2 }, avgCost }]). When
// given, invoices use exactly those products, prices and costs, and the
// products themselves are not rewritten. Without it, a built-in sample
// catalog is used (tests, empty projects).
function generate({ months = 4, seed = 2026, now = new Date(), uids = {}, wholesaleClients = 15, retailClients = 50, catalog = null } = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const chance = (p) => r() < p;
  const weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = r() * total;
    for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
    return pairs[pairs.length - 1][0];
  };
  const U = {
    car1: uids.agent_car1 || "demo-agent-car1",
    car2: uids.agent_car2 || "demo-agent-car2",
    keeper: uids.warehouse_keeper || "demo-warehouse-keeper",
    accountant: uids.accountant || "demo-accountant",
    accountantEmail: uids.accountantEmail || null,
  };

  // Day 0 = first day of the period (Khartoum calendar).
  const todayYmd = new Date(now.getTime() + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
  const end = new Date(`${todayYmd}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  const totalDays = Math.round((end - start) / DAY) + 1;
  const ymdOf = (i) => new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
  // ISO time on a given business day at Khartoum hour h (fractional).
  const at = (i, h) => new Date(start.getTime() + i * DAY + (h - TZ_OFFSET_H) * 3600e3).toISOString();
  const nowIso = now.toISOString();
  const notFuture = (iso) => (iso > nowIso ? nowIso : iso);

  // ── products ──
  const useReal = Array.isArray(catalog) && catalog.length > 0;
  const PRODUCTS_ = useReal
    ? catalog
        .filter((c) => c.prices && Number(c.prices.car1) > 0 && Number(c.prices.car2) > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          unit: c.unit,
          car1: Number(c.prices.car1),
          car2: Number(c.prices.car2),
          cost: typeof c.avgCost === "number" ? c.avgCost : null,
          // How popular each product is: varied but repeatable per seed.
          w: 0.5 + r(),
        }))
    : PRODUCTS;
  if (!PRODUCTS_.length) throw new Error("No active product has both a wholesale and a retail price — add prices first.");
  const products = useReal ? [] : PRODUCTS.map((p) => ({
    id: p.id,
    data: {
      name: p.name,
      nameEn: p.nameEn,
      unit: p.unit,
      category: p.category,
      prices: { car1: p.car1, car2: p.car2 },
      avgCost: p.cost,
      stock: { depot: 0, car1: 0, car2: 0, damaged: 0 },
      minStock: 20,
      active: true,
      createdAt: at(0, 7),
      demo: true,
    },
  }));
  const P = Object.fromEntries(PRODUCTS_.map((p) => [p.id, p]));

  // ── clients ──
  const usedPhones = new Set();
  const phone = () => {
    let p;
    do p = `09${pick(["1", "2", "6", "9"])}${String(int(0, 9999999)).padStart(7, "0")}`;
    while (usedPhones.has(p));
    usedPhones.add(p);
    return p;
  };
  const clients = [];
  let nextId = 1001;
  const mkClient = (route, rank) => {
    const nameFirst = pick(FIRST), nameMiddle = pick(MIDDLE), nameLast = pick(LAST);
    const id = String(nextId++);
    const ph = phone();
    const doc = {
      name: `${nameFirst} ${nameMiddle} ${nameLast}`,
      nameFirst,
      nameMiddle,
      nameLast,
      storeName: `${route === "car1" ? pick(STORE_W) : pick(STORE_R)} ${pick(STORE_SUFFIX)}`,
      location: pick(AREAS),
      route,
      phone: ph,
      whatsapp: chance(0.2) ? phone() : ph,
      storeClass: rank < 0.2 ? "A" : rank < 0.6 ? "B" : "C",
      active: !chance(0.05),
      createdAt: at(int(0, Math.max(1, Math.floor(totalDays * 0.15))), 10 + r() * 6),
      createdBy: U[route],
      demo: true,
    };
    doc.deliveryRoute = routeOfArea(doc.location);
    doc.syncAt = doc.createdAt;
    clients.push({ id, data: doc });
    return {
      id,
      route,
      doc,
      weight: 1 / Math.pow(rank * 10 + 1, 0.9), // a few big buyers, a long tail
      routeDay: int(0, 5), // retail: Sat..Thu
    };
  };
  const W = Array.from({ length: wholesaleClients }, (_, i) => mkClient("car1", i / wholesaleClients));
  const R = Array.from({ length: retailClients }, (_, i) => mkClient("car2", i / retailClients));

  // ── invoices ──
  const orders = [];
  const soldByDay = []; // [{car1:{pid:qty}, car2:{...}}]
  const pickProducts = (n) => {
    const chosen = new Set();
    n = Math.min(n, PRODUCTS_.length);
    while (chosen.size < n) chosen.add(weighted(PRODUCTS_.map((p) => [p.id, p.w])));
    return [...chosen];
  };
  const makeOrder = (client, i, hour) => {
    const route = client.route;
    const lines = pickProducts(route === "car1" ? int(2, 5) : int(1, 4)).map((pid) => {
      const p = P[pid];
      const qty = route === "car1" ? int(8, 45) * (client.weight > 0.5 ? 2 : 1) : int(1, 6) + (client.weight > 0.5 ? int(1, 4) : 0);
      const price = p[route];
      return { productId: pid, name: p.name, unit: p.unit, price, qty, freeSample: false, subtotal: price * qty, unitCost: p.cost };
    });
    if (chance(0.05)) {
      const p = P[pick(PRODUCTS_).id];
      if (!lines.some((l) => l.productId === p.id)) {
        lines.push({ productId: p.id, name: p.name, unit: p.unit, price: p[route], qty: 1, freeSample: true, subtotal: 0, unitCost: p.cost });
      }
    }
    const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
    const discount = chance(route === "car1" ? 0.15 : 0.06) ? Math.round((subtotal * (0.01 + r() * 0.03)) / 500) * 500 : 0;
    const createdAt = notFuture(at(i, hour));
    const cancelled = chance(0.02);
    const id = `demo-inv-${String(orders.length + 1).padStart(5, "0")}`;
    const doc = {
      clientId: client.id,
      route,
      items: lines,
      subtotal,
      discount,
      total: subtotal - discount,
      notes: "",
      status: cancelled ? "cancelled" : "active",
      deliveryDate: null,
      createdAt,
      placedBy: U[route],
      demo: true,
    };
    if (cancelled) {
      doc.updatedAt = createdAt;
      doc.updatedBy = U[route];
    }
    orders.push({ id, data: doc, day: i });
    if (!cancelled) {
      const bucket = (soldByDay[i] = soldByDay[i] || { car1: {}, car2: {} });
      lines.forEach((l) => (bucket[route][l.productId] = (bucket[route][l.productId] || 0) + l.qty));
    }
  };

  for (let i = 0; i < totalDays; i++) {
    const dow = new Date(`${ymdOf(i)}T12:00:00Z`).getUTCDay(); // 5 = Friday
    if (dow === 5) continue;
    const routeDay = (dow + 1) % 7; // Sat=0 … Thu=5
    const growth = 0.75 + 0.5 * (i / totalDays) + (Number(ymdOf(i).slice(8)) <= 5 ? 0.1 : 0);
    // retail: clients on today's route, most of them buy
    R.forEach((c) => {
      if (c.doc.active === false) return;
      if (c.routeDay === routeDay && chance(Math.min(0.95, 0.7 * growth))) makeOrder(c, i, 8.5 + r() * 8);
    });
    // a few off-route retail top-ups
    for (let k = 0; k < Math.round(r() * 2 * growth); k++) makeOrder(weighted(R.map((c) => [c, c.weight])), i, 9 + r() * 7);
    // wholesale: on demand
    const nW = Math.round((0.8 + r() * 2.4) * growth);
    for (let k = 0; k < nW; k++) makeOrder(weighted(W.filter((c) => c.doc.active !== false).map((c) => [c, c.weight])), i, 9 + r() * 6);
  }
  orders.sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));

  // ── stock ledger: receipts → depot → loadings → vans ──
  const inventoryDocs = [];
  const stock = Object.fromEntries(PRODUCTS_.map((p) => [p.id, { depot: 0, car1: 0, car2: 0, damaged: 0 }]));
  const seq = {};
  const mkDoc = (type, route, i, hour, items) => {
    const day = ymdOf(i);
    const key = `${day}-${type}-${route || "depot"}`;
    seq[key] = (seq[key] || 0) + 1;
    const createdAt = notFuture(at(i, hour));
    inventoryDocs.push({
      id: `demo-${type}-${String(inventoryDocs.length + 1).padStart(4, "0")}`,
      data: {
        type,
        route,
        items,
        status: "confirmed",
        createdBy: U.keeper,
        createdByRole: "warehouse_keeper",
        createdAt,
        businessDay: day,
        dailySeq: seq[key],
        warehouseKeeperNote: "",
        sourceRequestId: null,
        agentConfirmed: type === "loading",
        agentConfirmedAt: type === "loading" ? createdAt : null,
        agentConfirmedBy: type === "loading" ? U[route] : null,
        disputeReason: null,
        finalizedAt: createdAt,
        demo: true,
      },
    });
  };
  const futureNeed = (route, from, days) => {
    const need = {};
    for (let d = from; d < Math.min(totalDays, from + days); d++) {
      const b = soldByDay[d]?.[route] || {};
      Object.entries(b).forEach(([pid, q]) => (need[pid] = (need[pid] || 0) + q));
    }
    return need;
  };
  for (let i = 0; i < totalDays; i++) {
    const dow = new Date(`${ymdOf(i)}T12:00:00Z`).getUTCDay();
    // Sunday: supplier delivery into the depot, covering ~9 days ahead
    if (i === 0 || dow === 0) {
      const need = futureNeed("car1", i, 9);
      const needR = futureNeed("car2", i, 9);
      const items = PRODUCTS_.map((p) => {
        const want = Math.ceil(((need[p.id] || 0) + (needR[p.id] || 0)) * 1.15) + (i === 0 ? 40 : 0);
        const have = stock[p.id].depot;
        const qty = Math.max(0, want - have);
        return { productId: p.id, name: p.name, unit: p.unit, qty: Math.ceil(qty / 10) * 10, costPrice: p.cost ?? null };
      }).filter((it) => it.qty > 0);
      if (items.length) {
        mkDoc("received", null, i, 7.5, items);
        items.forEach((it) => (stock[it.productId].depot += it.qty));
      }
    }
    // Vans load every 2nd working day for what they'll sell until the next load
    if (dow !== 5 && i % 2 === 0) {
      for (const route of ["car1", "car2"]) {
        const need = futureNeed(route, i, 3);
        const items = PRODUCTS_.map((p) => {
          const want = Math.ceil((need[p.id] || 0) * 1.1);
          const qty = Math.min(stock[p.id].depot, Math.max(0, want - stock[p.id][route]));
          return { productId: p.id, name: p.name, unit: p.unit, qty };
        }).filter((it) => it.qty > 0);
        if (items.length) {
          mkDoc("loading", route, i, 7.8, items);
          items.forEach((it) => {
            stock[it.productId].depot -= it.qty;
            stock[it.productId][route] += it.qty;
          });
        }
      }
    }
    // the day's sales leave the vans (top up from depot if a van ran short)
    for (const route of ["car1", "car2"]) {
      Object.entries(soldByDay[i]?.[route] || {}).forEach(([pid, q]) => {
        if (stock[pid][route] < q) {
          const top = q - stock[pid][route];
          stock[pid].depot -= top;
          stock[pid][route] += top;
        }
        stock[pid][route] -= q;
      });
    }
    // free samples also leave the van
    orders
      .filter((o) => o.day === i && o.data.status !== "cancelled")
      .forEach((o) =>
        o.data.items.filter((l) => l.freeSample).forEach((l) => {
          const s = stock[l.productId];
          if (s[o.data.route] >= l.qty) s[o.data.route] -= l.qty;
          else s.depot -= l.qty;
        })
      );
    // the odd damaged carton
    if (chance(0.03)) {
      const p = pick(PRODUCTS_);
      if (stock[p.id].depot > 5) {
        const qty = int(1, 3);
        mkDoc("damage", null, i, 15, [{ productId: p.id, name: p.name, unit: p.unit, qty }]);
        stock[p.id].depot -= qty;
        stock[p.id].damaged += qty;
      }
    }
  }
  // Where the history leaves each product's stock (used only with --reset-stock
  // for a real catalog; always for the sample catalog).
  const finalStock = Object.fromEntries(
    PRODUCTS_.map((p) => {
      const s = stock[p.id];
      return [p.id, { depot: Math.max(0, s.depot), car1: Math.max(0, s.car1), car2: Math.max(0, s.car2), damaged: s.damaged }];
    })
  );
  products.forEach((p) => {
    const s = stock[p.id];
    p.data.stock = { depot: Math.max(0, s.depot), car1: Math.max(0, s.car1), car2: Math.max(0, s.car2), damaged: s.damaged };
  });

  // ── payments (accountant) — recorded on INVOICE LOGS ──
  // A log = one van's invoices of one day. The agent hands over money for a
  // day; the accountant records it on the log with its reference and splits
  // it between the invoices (each split adds up exactly to the payment).
  // Retail vans settle within a day or two; wholesale clients pay later, in
  // one or two rounds; the last days are still open, so there's always
  // something to record when testing.
  const invoicePayments = [];
  const paymentRefs = [];
  const logPayments = [];
  const usedRefs = new Set();
  const payDocs = {}; // orderId -> invoicePayments doc
  const lastDayIdx = totalDays - 1;
  const byLog = new Map();
  orders.forEach((o) => {
    if (o.data.status === "cancelled") return;
    const key = `${o.data.route}_${o.day}`;
    if (!byLog.has(key)) byLog.set(key, { route: o.data.route, dayIdx: o.day, invoices: [] });
    byLog.get(key).invoices.push(o);
  });
  let payN = 0;
  function recordPayment(log, dayIdx, shares, extraLogs = []) {
    const allocations = {};
    let amount = 0;
    shares.forEach(([o, amt]) => {
      if (amt > 0) {
        allocations[o.id] = amt;
        amount += amt;
      }
    });
    if (!amount || dayIdx > lastDayIdx) return;
    const bank = weighted(BANKS);
    let ref;
    do ref = String(int(10000000, 99999999999));
    while (usedRefs.has(`${bank}__${ref}`));
    usedRefs.add(`${bank}__${ref}`);
    const id = `demo-logpay-${String(++payN).padStart(5, "0")}`;
    const day = ymdOf(log.dayIdx);
    const logId = `${log.route}_${day}`;
    const logsOf = [log, ...extraLogs];
    const logIds = logsOf.map((l) => `${l.route}_${ymdOf(l.dayIdx)}`);
    const allocLogs = Object.fromEntries(Object.keys(allocations).map((oid) => {
      const o = orders.find((x) => x.id === oid);
      return [oid, `${o.data.route}_${ymdOf(o.day)}`];
    }));
    // Same-day settlement happens in the evening, after the day's invoices.
    const createdAt = notFuture(at(dayIdx, dayIdx === log.dayIdx ? 19 + r() * 2 : 10 + r() * 7));
    const date = ymdOf(dayIdx);
    logPayments.push({ id, data: { logId, logIds, days: logIds.map((x) => x.slice(-10)).sort(), allocLogs, route: log.route, day, ref, bank, amount, date, note: null, currency: "SDG", status: "active", allocations, allocatedTotal: amount, createdAt, createdBy: U.accountant, createdByEmail: U.accountantEmail, demo: true } });
    paymentRefs.push({ id: `${bank}__${ref}`, data: { logId, logIds, logPaymentId: id, route: log.route, day, createdAt, amount, date, bank, ref, refRev: [...ref].reverse().join(""), last4: ref.slice(-4), demo: true } });
    for (const [orderId, amt] of Object.entries(allocations)) {
      const o = orders.find((x) => x.id === orderId);
      const doc = (payDocs[orderId] = payDocs[orderId] || { orderId, route: o.data.route, clientId: o.data.clientId, payments: [], paidTotal: 0, count: 0, demo: true });
      doc.payments.push({ id: `${id}:${orderId}`, viaLog: id, logId: allocLogs[orderId], amount: amt, date, createdAt, createdBy: U.accountant });
      doc.paidTotal += amt;
      doc.count += 1;
      doc.updatedAt = createdAt;
    }
  }
  const owed = (o) => o.data.total - (payDocs[o.id]?.paidTotal || 0);
  const round1000 = (n) => Math.max(0, Math.floor(n / 1000) * 1000);
  const sortedLogs = [...byLog.values()].sort((a, b) => a.dayIdx - b.dayIdx);
  const settled = new Set();
  for (const log of sortedLogs) {
    const age = lastDayIdx - log.dayIdx;
    if (settled.has(log)) continue;
    if (log.route === "car2" && age > 3 && chance(0.15)) {
      // one transfer for this day and the next one of the same van
      const next = sortedLogs.find((l) => l.route === "car2" && l.dayIdx > log.dayIdx && !settled.has(l));
      if (next && next.dayIdx - log.dayIdx <= 2) {
        settled.add(next);
        recordPayment(log, next.dayIdx + int(0, 1), [...log.invoices, ...next.invoices].map((o) => [o, o.data.total]), [next]);
        continue;
      }
    }
    if (log.route === "car2") {
      if (!chance(age > 2 ? 0.92 : age > 0 ? 0.6 : 0.2)) continue;
      // one client sometimes pays only part
      const short = chance(0.12) ? pick(log.invoices) : null;
      recordPayment(log, log.dayIdx + int(0, Math.min(2, age)), log.invoices.map((o) => [o, o === short ? round1000(o.data.total / 2) : o.data.total]));
    } else {
      if (age < 3) continue; // the newest wholesale days are still open
      const first = log.invoices.filter(() => chance(age > 14 ? 0.65 : 0.4));
      if (first.length) recordPayment(log, log.dayIdx + int(1, Math.min(6, age)), first.map((o) => [o, chance(0.2) ? round1000(o.data.total * 0.6) : o.data.total]));
      if (age > 14 && chance(0.85)) {
        const rest = log.invoices.filter((o) => owed(o) > 0 && chance(0.8));
        if (rest.length) recordPayment(log, log.dayIdx + int(8, Math.min(20, age)), rest.map((o) => [o, owed(o)]));
      }
    }
  }
  Object.entries(payDocs).forEach(([id, data]) => invoicePayments.push({ id, data }));

  // ── competitor prices (sales supervisor) and saved routes / locations ──
  const routeNames = [...new Set(clients.map((c) => c.data.deliveryRoute).filter(Boolean))];
  const places = [];
  ["car1", "car2"].forEach((sales) => {
    routeNames.forEach((name) => places.push({ id: `${sales}__route__${name}`, data: { kind: "route", name, salesRoute: sales, createdBy: U.car1, createdAt: at(0, 9), demo: true } }));
  });
  [["الكلاكلة صنقعت", "خط الخرطوم"], ["أم درمان — المهدية", "خط أم درمان"], ["بحري — المزاد", "خط بحري"]].forEach(([name, route]) =>
    ["car1", "car2"].forEach((sales) => places.push({ id: `${sales}__location__${name}`, data: { kind: "location", name, deliveryRoute: route, salesRoute: sales, createdBy: U.car1, createdAt: at(0, 9), demo: true } }))
  );
  const RIVALS = ["سيقا", "الأمل للأغذية", "دال للأغذية", "حلويات الشرق"];
  const RIVAL_ITEMS = [["طحنية سادة", 400, "g", 2100], ["طحنية سادة", 800, "g", 3900], ["طحنية بالشوكولاتة", 400, "g", 2600], ["شيبس", 25, "g", 250], ["شيبس عائلي", 150, "g", 1200]];
  const competitorPrices = [];
  let cpN = 0;
  for (let dIdx = 0; dIdx < totalDays; dIdx += int(5, 9)) {
    RIVAL_ITEMS.forEach(([item, weight, unit, base]) => {
      RIVALS.forEach((company, ci) => {
        if (!chance(0.55)) return;
        const drift = 1 + (dIdx / totalDays) * 0.08 + (r() - 0.5) * 0.06 + ci * 0.03;
        const price = Math.round((base * drift) / 50) * 50;
        const id = `demo-cp-${String(++cpN).padStart(4, "0")}`;
        competitorPrices.push({
          id,
          data: { date: ymdOf(dIdx), deliveryRoute: pick(routeNames) || "خط الخرطوم", company, item, weight, weightUnit: unit, itemKey: `${normalizeAr(item)}|${weight}${unit}`, price, createdAt: at(dIdx, 13), createdBy: U.car1, createdByName: "مشرف المبيعات", route: "car1", demo: true },
        });
      });
    });
  }

  // Legal invoice numbers (INV-YYYY-000001…), in creation order per year.
  const invoiceCounters = {};
  [...orders]
    .sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt))
    .forEach((o) => {
      const y = new Date(o.data.createdAt).toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" }).slice(0, 4);
      invoiceCounters[y] = (invoiceCounters[y] || 0) + 1;
      Object.assign(o.data, { number: `INV-${y}-${String(invoiceCounters[y]).padStart(6, "0")}`, numberYear: Number(y), numberSeq: invoiceCounters[y] });
    });

  // Daily / monthly sales summaries, built by the same code the app uses.
  const { dayDocs, monthDocs } = statsDocsFromOrders(orders.map((o) => o.data));
  dayDocs.forEach((d) => (d.data.demo = true));
  monthDocs.forEach((d) => (d.data.demo = true));

  return {
    period: { from: ymdOf(0), to: todayYmd, days: totalDays },
    lastClientId: nextId - 1,
    usedRealCatalog: useReal,
    productCount: PRODUCTS_.length,
    finalStock,
    products,
    clients,
    orders: orders.map(({ id, data }) => ({ id, data })),
    inventoryDocs,
    invoicePayments,
    paymentRefs,
    dailyStats: dayDocs,
    monthlyStats: monthDocs,
    invoiceCounters,
    logPayments,
    places,
    competitorPrices,
    clientBalance: Object.entries(clientBalancesFrom(orders, Object.fromEntries(invoicePayments.map((p) => [p.id, p.data])))).map(([id, data]) => ({ id, data: { ...data, demo: true } })),
    logState: logStatesFromOrders(orders, Object.fromEntries(invoicePayments.map((p) => [p.id, p.data])), logPayments.map((p) => p.data)).map((d) => ({ ...d, data: { ...d.data, demo: true } })),
  };
}

module.exports = { generate, PRODUCTS };
