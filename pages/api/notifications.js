const { adminDb } = require("../../lib/firebaseAdmin");
const { requireUser } = require("../../lib/apiAuth");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };
const ROUTE_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };
const RESOLVED_LIMIT = 20; // bounded — just enough recent history to notify on
const CHANGE_LABEL = { cancel: "طلب إلغاء فاتورة", edit: "طلب تعديل فاتورة", client_edit: "طلب تعديل بيانات عميل" };
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

    if (role === "supervisor") {
      const [pendingRequests, pendingReceived, pendingDamage] = await Promise.all([
        adminDb.collection("changeRequests").where("status", "==", "pending").get(),
        adminDb.collection("inventoryDocs").where("type", "==", "received").where("status", "==", "pending").get(),
        adminDb.collection("inventoryDocs").where("type", "==", "damage").where("status", "==", "pending").get(),
      ]);
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
    } else if (role === "warehouse_keeper") {
      // Transfers the supervisor created, waiting to be released. Its own
      // bucket, so it doesn't inflate the shipping-requests badge.
      const pendingTransfers = await adminDb.collection("transfers").where("status", "==", "pending").get();
      pendingTransfers.docs.forEach((d) => {
        items.push({
          id: d.id,
          bucket: "transfer",
          needsAction: true,
          requestType: "تحويل",
          from: "المشرف",
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
      const mine = await adminDb.collection("inventoryDocs").where("createdBy", "==", decoded.uid).get();
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
            from: "المشرف",
            state: r.status === "confirmed" ? "تم الاعتماد" : "تم الرفض",
            note: r.rejectReason || "",
            tone: r.status === "confirmed" ? "good" : "bad",
            href: `/inventory/${r.id}`,
            at: r.finalizedAt,
          });
        });
    } else if (ROLE_TO_ROUTE[role]) {
      const myRoute = ROLE_TO_ROUTE[role];

      // Modification bucket: purely informational for an agent — they
      // never decide these, only find out the outcome.
      const decidedMine = await adminDb
        .collection("changeRequests")
        .where("requestedBy", "==", decoded.uid)
        .get();
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
            from: "المشرف",
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

      if (role === "agent_car1") {
        const toDecide = await adminDb
          .collection("shipmentRequests")
          .where("route", "==", "car2")
          .where("status", "==", "pending_car1")
          .get();
        toDecide.docs.forEach((d) => {
          const r = d.data();
          items.push({
            id: d.id,
            bucket: "shipping",
            needsAction: true,
            requestType: "أمر شحن",
            from: "مبيعات تجزئة",
            route: "car2",
            state: "بانتظار موافقتك",
            href: `/shipping/${d.id}`,
            at: r.requestedAt,
          });
        });
      }

      // My own shipping/cargo-return requests once resolved — informational.
      const myShipments = await adminDb
        .collection("shipmentRequests")
        .where("requestedBy", "==", decoded.uid)
        .get();
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
    return res.status(200).json({ items });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
