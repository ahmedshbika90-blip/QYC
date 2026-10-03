const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidRequestId } = require("../../../lib/requestId");
const { bumpVersions } = require("../../../lib/versions");
const { parseQty, isValidQty } = require("../../../lib/qty");
const { isOpenStatus, SHIPMENT_TYPE_LABELS } = require("../../../lib/shipmentStatus");

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
// ONE OPEN REQUEST PER AGENT: a new request (either type) is refused while
// the agent still has one that nobody has closed — i.e. it hasn't been
// fulfilled or cancelled by the warehouse keeper (or rejected by car1).
// Enforced with a per-agent pointer doc, `agentOpenShipment/{uid}`, read
// and written in the same transaction as the request itself, so two taps
// from two devices can't both slip through. The pointer is self-healing:
// it's only trusted while the request it points at is actually still open,
// so nothing else has to remember to clear it.
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
      return res.status(400).json({ error: "نوع الحركة يجب أن يكون أمر شحن أو مرتجع بضاعة" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "يجب إضافة منتج واحد على الأقل" });
    }
    for (const it of items) {
      if (!it.productId || !isValidQty(it.qty)) {
        return res.status(400).json({ error: "كل منتج يجب أن تكون له كمية بعدد صحيح أكبر من صفر (بدون كسور)" });
      }
    }
    const seen = new Set();
    for (const it of items) {
      if (seen.has(it.productId)) {
        return res.status(400).json({ error: "المنتج مكرر في الطلب — اجمع كميته في سطر واحد" });
      }
      seen.add(it.productId);
    }

    // Fast, friendly refusal before any stock checks. This also covers
    // requests created before the pointer doc existed; the transactional
    // check below is the one that's race-proof.
    const mine = await adminDb.collection("shipmentRequests").where("requestedBy", "==", decoded.uid).get();
    const alreadyOpen = mine.docs.find((d) => d.id !== requestId && isOpenStatus(d.data().status));
    if (alreadyOpen) {
      return res.status(409).json({
        error: `لديك ${SHIPMENT_TYPE_LABELS[alreadyOpen.data().type] || "طلب"} مفتوح لم يُنفَّذ أو يُلغَ بعد — لا يمكن إرسال طلب جديد حتى يتم تنفيذه أو إلغاؤه.`,
        openRequestId: alreadyOpen.id,
      });
    }

    const productRefs = items.map((it) => adminDb.collection("products").doc(it.productId));
    const productSnaps = await adminDb.getAll(...productRefs);

    // Availability check. LOADING draws from the depot; OFFLOADING draws
    // from this car's own remaining stock. Checked here so the agent is
    // told immediately instead of the request sitting in a queue only to
    // fail at fulfil time — and checked AGAIN inside the fulfil
    // transaction, which is the one that actually protects the balances
    // (stock can move between the two moments).
    const sourceField = type === "loading" ? "depot" : route;
    const shortages = [];

    const resolvedItems = items.map((it, i) => {
      const snap = productSnaps[i];
      if (!snap.exists) {
        const err = new Error("أحد المنتجات غير موجود");
        err.statusCode = 400;
        throw err;
      }
      const data = snap.data();
      const qty = parseQty(it.qty);
      const available = data.stock?.[sourceField] ?? 0;
      if (qty > available) {
        shortages.push({ productId: it.productId, name: data.name, requested: qty, available });
      }
      return { productId: it.productId, name: data.name, unit: data.unit, qty };
    });

    if (shortages.length) {
      const where = type === "loading" ? "المخزن" : "العربة";
      const detail = shortages
        .map((s) => `${s.name}: المتاح ${s.available}، المطلوب ${s.requested}`)
        .join("، ");
      const err = new Error(`الكمية غير متوفرة في ${where} — ${detail}`);
      err.statusCode = 409;
      err.shortages = shortages;
      throw err;
    }

    const docRef = adminDb.collection("shipmentRequests").doc(requestId);
    const lockRef = adminDb.collection("agentOpenShipment").doc(decoded.uid);
    const now = new Date().toISOString();
    const result = { duplicate: false };

    await adminDb.runTransaction(async (tx) => {
      const [existing, lock] = await Promise.all([tx.get(docRef), tx.get(lockRef)]);

      // Repeat of a request that already went through (weak connection).
      if (existing.exists) {
        if (existing.data().requestedBy !== decoded.uid) {
          const err = new Error("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
          err.statusCode = 409;
          throw err;
        }
        result.duplicate = true;
        return;
      }

      if (lock.exists && lock.data().requestId) {
        const openSnap = await tx.get(adminDb.collection("shipmentRequests").doc(lock.data().requestId));
        if (openSnap.exists && isOpenStatus(openSnap.data().status)) {
          const open = openSnap.data();
          const err = new Error(
            `لديك ${SHIPMENT_TYPE_LABELS[open.type] || "طلب"} مفتوح لم يُنفَّذ أو يُلغَ بعد — لا يمكن إرسال طلب جديد حتى يتم تنفيذه أو إلغاؤه.`
          );
          err.statusCode = 409;
          err.openRequestId = openSnap.id;
          throw err;
        }
      }

      tx.set(docRef, {
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
        cancelledAt: null,
        cancelledBy: null,
        cancelNote: "",
      });
      tx.set(lockRef, { requestId, at: now });
    });

    if (!result.duplicate) await bumpVersions(["shipmentRequests"]);
    return res.status(result.duplicate ? 200 : 201).json({ id: docRef.id, duplicate: result.duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message, shortages: err.shortages, openRequestId: err.openRequestId });
  }
}
