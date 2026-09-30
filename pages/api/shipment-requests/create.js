const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { createOnce } = require("../../../lib/idempotentCreate");
const { bumpVersions } = require("../../../lib/versions");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };

// An agent asks for a loading or offloading, instead of the warehouse
// keeper creating it out of nothing.
//
// LOADING (depot -> car): car1 (wholesale) requests go straight to the
// warehouse keeper's queue. car2 (retail) requests need car1's approval
// FIRST — car1 acts as a check on retail shipments before they even reach
// the warehouse keeper.
//
// OFFLOADING (car -> depot): always goes straight to the warehouse
// keeper's queue, for EITHER car — it's unsold stock coming back, not
// stock going out to sell, so there's nothing for car1 to gate here.
//
// Either way, nothing here moves stock; this is only a request. The
// actual document (and its stock effect) is created when the warehouse
// keeper fulfills it — see /api/shipment-requests/[id]/fulfill.js.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2"]);

    const route = ROLE_TO_ROUTE[decoded.role];
    const { type, items, note, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }
    if (!["loading", "offloading"].includes(type)) {
      return res.status(400).json({ error: "نوع الحركة يجب أن يكون تحميل أو تفريغ" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "يجب إضافة منتج واحد على الأقل" });
    }
    for (const it of items) {
      if (!it.productId || !it.qty || it.qty <= 0) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية صحيحة" });
      }
    }

    const productRefs = items.map((it) => adminDb.collection("products").doc(it.productId));
    const productSnaps = await adminDb.getAll(...productRefs);
    const resolvedItems = items.map((it, i) => {
      const snap = productSnaps[i];
      if (!snap.exists) {
        const err = new Error("أحد المنتجات غير موجود");
        err.statusCode = 400;
        throw err;
      }
      return { productId: it.productId, name: snap.data().name, unit: snap.data().unit, qty: Number(it.qty) };
    });

    const docRef = adminDb.collection("shipmentRequests").doc(requestId);
    const now = new Date().toISOString();

    const result = await createOnce(
      docRef,
      {
        route,
        type,
        items: resolvedItems,
        note: note || "",
        status: route === "car2" && type === "loading" ? "pending_car1" : "pending_warehouse",
        requestedBy: decoded.uid,
        requestedAt: now,
        car1Decision: null,
        fulfilledDocId: null,
        fulfilledAt: null,
      },
      { ownerField: "requestedBy", ownerId: decoded.uid }
    );

    if (!result.duplicate) await bumpVersions(["shipmentRequests"]);
    return res.status(result.duplicate ? 200 : 201).json({ id: docRef.id, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
