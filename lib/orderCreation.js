const { adminDb } = require("./firebaseAdmin");
const { calculateDeliveryDate } = require("./deliveryDate");

/**
 * Looks up each item's product server-side (price can never be spoofed),
 * computes subtotals/total, and calculates the delivery date for the
 * given route. Throws a {statusCode, message} style error on bad input.
 * Messages are in Arabic since they're shown directly to clients on the
 * public order form.
 */
async function buildOrderFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("يجب اختيار منتج واحد على الأقل");
    err.statusCode = 400;
    throw err;
  }

  const resolvedItems = [];
  for (const item of items) {
    if (!item.productId || !item.qty || item.qty < 1) {
      const err = new Error("كل منتج يجب أن تكون له كمية واحدة على الأقل");
      err.statusCode = 400;
      throw err;
    }
    const productSnap = await adminDb.collection("products").doc(item.productId).get();
    if (!productSnap.exists || productSnap.data().active === false) {
      const err = new Error("أحد المنتجات لم يعد متوفرًا، يرجى تحديث الصفحة والمحاولة مرة أخرى");
      err.statusCode = 400;
      throw err;
    }
    const product = productSnap.data();
    const qty = Number(item.qty);
    resolvedItems.push({
      productId: item.productId,
      name: product.name,
      unit: product.unit,
      price: product.price,
      qty,
      subtotal: Math.round(product.price * qty * 100) / 100,
    });
  }

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
