const { adminDb } = require("./firebaseAdmin");
const { calculateDeliveryDate } = require("./deliveryDate");

/**
 * Looks up each item's product server-side (price can never be spoofed),
 * resolves the price for the GIVEN route (each product has a separate
 * price per route, set by the supervisor), computes subtotals/total, and
 * checks that route's live stock is enough to cover the order — blocking
 * with a clear Arabic error if not. Throws a {statusCode, message} style
 * error on bad input; messages are in Arabic since they're shown directly
 * to clients on the public order form.
 *
 * Pass `tx` (a Firestore transaction) when this needs to be atomic with
 * the actual stock decrement and order write that follow it — which is
 * every real order-creation path now, since a plain (non-transactional)
 * read-then-later-write here would let two concurrent orders both see
 * "enough stock" and both succeed against the same limited amount.
 *
 * Pass `skipStockCheck: true` when editing an existing order's items —
 * the naive per-item check here can't tell that the old quantities are
 * about to be released back, so it would wrongly reject a valid increase.
 * The caller is expected to validate a combined delta (old minus new)
 * instead, via applyStockMovements.
 */
async function buildOrderFromItems(items, route, tx, skipStockCheck) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("يجب اختيار منتج واحد على الأقل");
    err.statusCode = 400;
    throw err;
  }

  const refs = items.map((item) => adminDb.collection("products").doc(item.productId));
  const snaps = tx ? await Promise.all(refs.map((ref) => tx.get(ref))) : await adminDb.getAll(...refs);

  const resolvedItems = [];
  items.forEach((item, i) => {
    if (!item.productId || !item.qty || item.qty < 1) {
      const err = new Error("كل منتج يجب أن تكون له كمية واحدة على الأقل");
      err.statusCode = 400;
      throw err;
    }
    const snap = snaps[i];
    if (!snap.exists || snap.data().active === false) {
      const err = new Error("أحد المنتجات لم يعد متوفرًا، يرجى تحديث الصفحة والمحاولة مرة أخرى");
      err.statusCode = 400;
      throw err;
    }
    const product = snap.data();
    const price = product.prices?.[route];
    if (price === undefined || price === null) {
      const err = new Error(`لم يتم تحديد سعر لمنتج "${product.name}" على هذا المسار`);
      err.statusCode = 400;
      throw err;
    }
    const qty = Number(item.qty);

    const available = product.stock?.[route] || 0;
    if (!skipStockCheck && available < qty) {
      const err = new Error(`الكمية المتاحة من "${product.name}" غير كافية (المتاح: ${available})`);
      err.statusCode = 400;
      throw err;
    }

    resolvedItems.push({
      productId: item.productId,
      name: product.name,
      unit: product.unit,
      price,
      qty,
      subtotal: Math.round(price * qty * 100) / 100,
    });
  });

  const total = Math.round(resolvedItems.reduce((sum, it) => sum + it.subtotal, 0) * 100) / 100;
  return { resolvedItems, total };
}

async function getActiveClient(clientId) {
  if (!clientId || !/^\d{4}$/.test(clientId)) {
    const err = new Error("رقم العميل يجب أن يتكون من 4 أرقام");
    err.statusCode = 400;
    throw err;
  }
  const clientSnap = await adminDb.collection("clients").doc(clientId).get();
  if (!clientSnap.exists) {
    const err = new Error("لا يوجد عميل بهذا الرقم");
    err.statusCode = 404;
    throw err;
  }
  const client = clientSnap.data();
  if (client.active === false) {
    const err = new Error("هذا الحساب غير مُفعّل، يرجى التواصل مع المندوب");
    err.statusCode = 403;
    throw err;
  }
  return client;
}

module.exports = { buildOrderFromItems, getActiveClient, calculateDeliveryDate };
