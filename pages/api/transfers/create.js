const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { bumpVersions } = require("../../../lib/versions");
const { parseQty, isValidQty } = require("../../../lib/qty");

// Internal stock transfer OUT of the main depot to another center.
//
// A quantity-only movement: no price, no cost and no destination — where
// the goods go is outside this system. Only the SUPERVISOR creates one.
// The warehouse keeper then releases it (./[id]/release.js), which is the
// moment stock actually leaves the depot. The keeper cannot create or
// propose a transfer.
//
// Availability is checked here so the supervisor is told immediately, and
// again at release (inside the transaction), since stock can move between.
function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["manager"]);

    const { items, note, requestId } = req.body || {};
    if (!requestId || typeof requestId !== "string") throw fail("رقم الطلب مطلوب");
    if (!Array.isArray(items) || items.length === 0) throw fail("أضف منتجًا واحدًا على الأقل");

    // One line per product (merge duplicates), positive quantities only.
    const byId = new Map();
    for (const it of items) {
      if (!it?.productId || !isValidQty(it?.qty)) throw fail("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر (بدون كسور)");
      const qty = parseQty(it.qty);
      byId.set(it.productId, (byId.get(it.productId) || 0) + qty);
    }
    const ids = [...byId.keys()];
    const snaps = await adminDb.getAll(...ids.map((id) => adminDb.collection("products").doc(id)));

    const resolved = [];
    const shortages = [];
    snaps.forEach((snap, i) => {
      if (!snap.exists) throw fail("أحد المنتجات غير موجود");
      const qty = byId.get(ids[i]);
      const available = snap.data().stock?.depot ?? 0;
      if (qty > available) shortages.push({ name: snap.data().name, requested: qty, available });
      resolved.push({ productId: ids[i], name: snap.data().name, unit: snap.data().unit, qty });
    });
    if (shortages.length) {
      const err = fail(
        "الكمية غير متوفرة في المخزن — " +
          shortages.map((s) => `${s.name}: المتاح ${s.available}، المطلوب ${s.requested}`).join("، "),
        409
      );
      err.shortages = shortages;
      throw err;
    }

    const ref = adminDb.collection("transfers").doc(requestId);
    let duplicate = false;
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        if (existing.data().createdBy !== decoded.uid) throw fail("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى", 409);
        duplicate = true; // a resend of the same transfer — don't create twice
        return;
      }
      tx.set(ref, {
        items: resolved,
        note: String(note || "").slice(0, 300),
        status: "pending",
        createdBy: decoded.uid,
        createdAt: new Date().toISOString(),
      });
    });
    if (!duplicate) await bumpVersions(["transfers"]);
    return res.status(duplicate ? 200 : 201).json({ id: ref.id, duplicate });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message, shortages: err.shortages });
  }
}
