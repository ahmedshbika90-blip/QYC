const { adminDb } = require("./firebaseAdmin");
const { calculateDeliveryDate } = require("./deliveryDate");

/**
 * Looks up each item's product server-side (price can never be spoofed),
 * computes subtotals/total, and calculates the delivery date for the
 * given route. Throws a {statusCode, message} style error on bad input.
 */
async function buildOrderFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("items must be a non-empty array");
    err.statusCode = 400;
    throw err;
  }

  const resolvedItems = [];
  for (const item of items) {
    if (!item.productId || !item.qty || item.qty < 1) {
      const err = new Error("Each item needs a productId and qty >= 1");
      err.statusCode = 400;
      throw err;
    }
    const productSnap = await adminDb.collection("products").doc(item.productId).get();
    if (!productSnap.exists || productSnap.data().active === false) {
      const err = new Error(`Product ${item.productId} is not available`);
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
    const err = new Error("clientId must be a 4-digit code");
    err.statusCode = 400;
    throw err;
  }
  const clientSnap = await adminDb.collection("clients").doc(clientId).get();
  if (!clientSnap.exists) {
    const err = new Error("No client found with that ID");
    err.statusCode = 404;
    throw err;
  }
  const client = clientSnap.data();
  if (client.active === false) {
    const err = new Error("This client account is inactive");
    err.statusCode = 403;
    throw err;
  }
  return client;
}

module.exports = { buildOrderFromItems, getActiveClient, calculateDeliveryDate };
