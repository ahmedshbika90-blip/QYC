const { adminDb } = require("../../lib/firebaseAdmin");
const { requireUser } = require("../../lib/apiAuth");
const { notifySignature } = require("../../lib/notifySig");
const { isMineToDecide } = require("../../lib/supervision");
const { listVans } = require("../../lib/vans");

// Stock adjustments (lib/stockAdjustments.js) as notification items.
const ADJ_LABEL = { writeoff: "تسوية تالف", freeSample: "عينات مجانية" };
const ADJ_MODE = { transfer: "مرتجع شركة", obsolete: "غير صالحة", supplier: "على المورد", company: "على الشركة" };
const ADJ_STATE = { pending: "بانتظار القرار", approved: "اعتُمدت", rejected: "رُفضت" };
async function adjustmentItems(filter, needsAction, { forKeeper = false, base = "/stock-adjustments" } = {}) {
  const snap = await adminDb.collection("stockAdjustments").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(filter)
    .map((a) => ({
      id: `adj-${a.id}-${a.status}`,
      bucket: "adjust", // lights تسويات المخزون and its section
      tab: a.kind, // the section inside it (writeoff / freeSample)
      needsAction: needsAction(a),
      // The keeper isn't told who pays for samples, or the margin effect.
      requestType: forKeeper && a.kind === "freeSample" ? "طلب عينات مجانية" : `${ADJ_LABEL[a.kind]} — ${ADJ_MODE[a.mode] || ""}`,
      from: a.items.map((i) => `${i.name} × ${i.qty}`).join("، "),
      state: needsAction(a) ? "بانتظارك" : ADJ_STATE[a.status],
      tone: a.status === "rejected" ? "bad" : a.status === "approved" ? "good" : undefined,
      // straight to the right section and the request itself
      href: `${base}?tab=${a.kind}&focus=${encodeURIComponent(a.id)}`,
      at: a.decidedAt || a.requestedAt,
    }));
}
const { reportServerError } = require("../../lib/monitor");

// Resolved items are "recent history": each history query is bounded by
// an index (firestore.indexes.json). Until those indexes are deployed the
// old unbounded query is used, so nothing breaks in between.
const missingIndex = (err) => err && (err.code === 9 || /FAILED_PRECONDITION|requires an index/i.test(err.message || ""));
async function bounded(fast, slow) {
  try {
    return await fast();
  } catch (err) {
    if (!missingIndex(err)) throw err;
    console.warn("[notifications] index not deployed yet — using the slower query. Run: firebase deploy --only firestore:indexes");
    return slow();
  }
}

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };
// Van names (lib/vans.js) — filled per request below; the originals by default.
let ROUTE_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };
const RESOLVED_LIMIT = 20; // bounded — just enough recent history to notify on
const CHANGE_LABEL = { cancel: "طلب إلغاء فاتورة", edit: "طلب تعديل فاتورة", refund: "طلب مرتجع", client_edit: "طلب تعديل بيانات عميل" };
const changeLabel = (type) => CHANGE_LABEL[type] || "طلب تعديل";

// Every notification item: { id, bucket, needsAction, requestType, from,
// state, href, at }.
//
//  - needsAction: true  → still pending — the client NEVER marks these
//    "seen" locally, so they keep appearing every session until the
//    underlying thing is actually resolved (approved/rejected/fulfilled/
//    confirmed). That's the whole point: an outstanding task doesn't get
//    to be dismissed away.
//  - needsAction: false → already resolved (approved/rejected/fulfilled) —
//    purely informational. The client marks these seen once opened or
//    once the prompt is dismissed, and they never reappear after that.
//
// "bucket" separates the two notification surfaces this app has: the
// invoice modification-request review (nav: الطلبات) and shipping orders /
// cargo returns (nav: المستندات → شحن) — each gets its own red dot and its
// own count, deliberately not merged into one number.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const role = decoded.role;
    const items = [];

    // Nothing changed since the device's copy → 1 read, no queries.
    const sig = await notifySignature(decoded);
    if (sig && req.query.sig === sig) return res.status(200).json({ unchanged: true, sig });
    // van names for the "from" line (only when the list is actually built)
    ROUTE_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة", ...Object.fromEntries((await listVans()).filter((v) => v.id !== "car1" && v.id !== "car2").map((v) => [v.id, v.label])) };

    if (role === "manager") {
      const [pendingRequests, pendingReceived, pendingDamage, stockCheck] = await Promise.all([
        adminDb.collection("changeRequests").where("status", "==", "pending").get(),
        adminDb.collection("inventoryDocs").where("type", "==", "received").where("status", "==", "pending").get(),
        adminDb.collection("inventoryDocs").where("type", "==", "damage").where("status", "==", "pending").get(),
        adminDb.collection("meta").doc("stockCheck").get(),
      ]);
      // Nightly stock check found balances that don't match their movements.
      const sc = stockCheck.exists ? stockCheck.data() : null;
      if (sc && sc.diffs && sc.diffs.length) {
        items.push({
          id: `stockcheck-${sc.at}`,
          bucket: "modification",
          needsAction: true,
          requestType: "فحص المخزون",
          from: `${sc.diffs.length} فرق في الأرصدة`,
          state: "راجع الأرصدة",
          href: "/stock-check",
          at: sc.at,
        });
      }
      pendingRequests.docs.forEach((d) => {
        const r = d.data();
        items.push({
          id: d.id,
          bucket: "modification",
          needsAction: true,
          requestType: changeLabel(r.type),
          from: ROUTE_LABEL[r.route] || "",
          state: "بانتظار قرارك",
          href: `/requests/${d.id}`,
          at: r.requestedAt,
        });
      });
      pendingReceived.docs.forEach((d) => {
        const r = d.data();
        items.push({
          id: d.id,
          bucket: "modification",
          needsAction: true,
          requestType: "استلام بضاعة",
          from: "أمين المخزن",
          state: "بانتظار اعتمادك",
          href: `/inventory/${d.id}`,
          at: r.createdAt,
        });
      });
      pendingDamage.docs.forEach((d) => {
        const r = d.data();
        items.push({
          id: d.id,
          bucket: "modification",
          needsAction: true,
          requestType: "تسجيل تالف",
          from: "أمين المخزن",
          state: "بانتظار اعتمادك",
          href: `/inventory/${d.id}`,
          at: r.createdAt,
        });
      });
      // damaged write-offs waiting for him; the outcome of the free samples he asked for
      const recent = new Date(Date.now() - 14 * 864e5).toISOString();
      items.push(...(await adjustmentItems((a) => (a.kind === "writeoff" && a.status === "pending") || (a.kind === "freeSample" && a.status !== "pending" && String(a.decidedAt) >= recent), (a) => a.status === "pending")));
    } else if (role === "warehouse_keeper") {
      // free samples to execute; the outcome of his damaged write-offs
      const recentK = new Date(Date.now() - 14 * 864e5).toISOString();
      items.push(
        ...(await adjustmentItems((a) => (a.kind === "freeSample" && a.status === "pending") || (a.kind === "writeoff" && a.status !== "pending" && String(a.decidedAt) >= recentK), (a) => a.status === "pending", { forKeeper: true }))
      );
      // Transfers the supervisor created, waiting to be released. Its own
      // bucket, so it doesn't inflate the shipping-requests badge.
      const pendingTransfers = await adminDb.collection("transfers").where("status", "==", "pending").get();
      pendingTransfers.docs.forEach((d) => {
        items.push({
          id: d.id,
          bucket: "transfer",
          needsAction: true,
          requestType: "تحويل",
          from: "المدير",
          state: "بانتظار الإخراج من المخزن",
          href: "/warehouse/transfers",
          at: d.data().createdAt,
        });
      });
      const pendingWarehouse = await adminDb
        .collection("shipmentRequests")
        .where("status", "==", "pending_warehouse")
        .get();
      pendingWarehouse.docs.forEach((d) => {
        const r = d.data();
        items.push({
          id: d.id,
          bucket: "shipping",
          needsAction: true,
          requestType: r.type === "offloading" ? "مرتجع بضاعة" : "أمر شحن",
          from: ROUTE_LABEL[r.route] || "",
          // Which car it came from — the keeper's nav lights up the matching
          // section (مبيعات جملة / مبيعات تجزئة), not just "طلبات الشحن".
          route: r.route,
          state: "بانتظار التنفيذ",
          href: `/shipping/${d.id}`,
          at: r.requestedAt,
        });
      });

      // The supervisor's decision on goods received / damage the keeper
      // recorded — informational, shown once.
      const mineQ = adminDb.collection("inventoryDocs").where("createdBy", "==", decoded.uid);
      const mine = await bounded(
        () => mineQ.where("type", "in", ["received", "damage"]).orderBy("finalizedAt", "desc").limit(RESOLVED_LIMIT * 2).get(),
        () => mineQ.get()
      );
      mine.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => (r.type === "received" || r.type === "damage") && (r.status === "confirmed" || r.status === "rejected"))
        .sort((a, b) => (b.finalizedAt || "").localeCompare(a.finalizedAt || ""))
        .slice(0, RESOLVED_LIMIT)
        .forEach((r) => {
          items.push({
            id: r.id,
            bucket: "inventory",
            needsAction: false,
            requestType: r.type === "damage" ? "تسجيل تالف" : "استلام بضاعة",
            from: "المدير",
            state: r.status === "confirmed" ? "تم الاعتماد" : "تم الرفض",
            note: r.rejectReason || "",
            tone: r.status === "confirmed" ? "good" : "bad",
            href: `/inventory/${r.id}`,
            at: r.finalizedAt,
          });
        });
    } else if (role === "accountant") {
      // Information only: stock adjustments requested or decided in the last 14 days.
      const since = new Date(Date.now() - 14 * 864e5).toISOString();
      items.push(...(await adjustmentItems((a) => String(a.decidedAt || a.requestedAt) >= since, () => false, { base: "/accounting/stock-movements" })));
    } else if (ROLE_TO_ROUTE[role]) {
      const myRoute = decoded.route;

      // Modification bucket: purely informational for an agent — they
      // never decide these, only find out the outcome.
      const decidedQ = adminDb.collection("changeRequests").where("requestedBy", "==", decoded.uid);
      const decidedMine = await bounded(
        () => decidedQ.where("status", "in", ["approved", "rejected"]).orderBy("decidedAt", "desc").limit(RESOLVED_LIMIT).get(),
        () => decidedQ.get()
      );
      decidedMine.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.status === "approved" || r.status === "rejected")
        .sort((a, b) => (b.decidedAt || "").localeCompare(a.decidedAt || ""))
        .slice(0, RESOLVED_LIMIT)
        .forEach((r) => {
          items.push({
            id: r.id,
            bucket: "modification",
            needsAction: false,
            requestType: changeLabel(r.type),
            from: "المدير",
            state: r.status === "approved" ? "تمت الموافقة" : "تم الرفض",
            note: r.decisionNote || "",
            tone: r.status === "approved" ? "good" : "bad",
            href: `/requests/${r.id}`,
            at: r.decidedAt,
          });
        });

      // Shipping bucket: pending confirmations on MY car are actionable —
      // I must confirm before that stock movement is final.
      const pendingConfirm = await adminDb
        .collection("inventoryDocs")
        .where("route", "==", myRoute)
        .where("status", "==", "pending")
        .get();
      pendingConfirm.docs.forEach((d) => {
        const r = d.data();
        if (r.type !== "loading") return; // e.g. a pending damage — supervisor's call
        items.push({
          id: d.id,
          bucket: "shipping",
          needsAction: true,
          // The document coming BACK from the warehouse is a delivery, not an
          // order: "تسليم بضاعة". "أمر شحن" is only the agent's own request.
          requestType: r.type === "offloading" ? "مرتجع بضاعة" : "تسليم بضاعة",
          from: "أمين المخزن",
          route: myRoute,
          state: "بانتظار تأكيدك",
          href: `/inventory/${d.id}`,
          at: r.createdAt,
        });
      });

      if (decoded.salesSupervisor) {
        const toDecide = await adminDb.collection("shipmentRequests").where("status", "==", "pending_car1").get();
        toDecide.docs.forEach((d) => {
          const r = d.data();
          if (!isMineToDecide(r, decoded)) return; // his own agents only
          items.push({
            id: d.id,
            bucket: "shipping",
            needsAction: true,
            requestType: "أمر شحن",
            from: r.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة",
            route: r.route,
            state: "بانتظار موافقتك",
            href: `/shipping/${d.id}`,
            at: r.requestedAt,
          });
        });
      }

      // My own shipping/cargo-return requests once resolved — informational.
      // Newest requests first, then ordered by when they were resolved;
      // RESOLVED_LIMIT×3 leaves room for long-pending older ones.
      const shipQ = adminDb.collection("shipmentRequests").where("requestedBy", "==", decoded.uid);
      const myShipments = await bounded(
        () => shipQ.where("status", "in", ["rejected", "fulfilled", "cancelled"]).orderBy("requestedAt", "desc").limit(RESOLVED_LIMIT * 3).get(),
        () => shipQ.get()
      );
      myShipments.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => ["rejected", "fulfilled", "cancelled"].includes(r.status))
        .map((r) => ({ ...r, _at: r.cancelledAt || r.fulfilledAt || r.car1Decision?.at || r.requestedAt || "" }))
        .sort((a, b) => b._at.localeCompare(a._at))
        .slice(0, RESOLVED_LIMIT)
        .forEach((r) => {
          const cancelled = r.status === "cancelled";
          items.push({
            id: r.id,
            bucket: "shipping",
            needsAction: false,
            requestType: r.type === "offloading" ? "مرتجع بضاعة" : "أمر شحن",
            from: r.status === "rejected" ? "مبيعات جملة" : "أمين المخزن",
            route: r.route,
            state: cancelled ? "تم الإلغاء" : r.status === "rejected" ? "تم الرفض" : "تم التنفيذ",
            // The keeper's reason travels with the notification itself, so
            // the agent reads WHY without having to open anything.
            note: cancelled ? r.cancelNote || "" : r.status === "rejected" ? r.car1Decision?.note || "" : "",
            tone: cancelled || r.status === "rejected" ? "bad" : "good",
            href: `/shipping/${r.id}`,
            at: r._at,
          });
        });
    }
    // Any other role (e.g. depot_viewer): no notifications.

    items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    return res.status(200).json({ items, sig });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
