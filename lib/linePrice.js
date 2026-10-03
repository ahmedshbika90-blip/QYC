// Price adjustment on ONE invoice line ("سعر معدّل").
//
// Sometimes a product is sold on a specific invoice ABOVE its list price
// (the catalog price for that route). The catalog stays as it is; only
// that line carries the higher price, with a required reason. Going
// BELOW the list price is not a price adjustment — that's what the
// invoice discount is for.
//
// A stored invoice line with an adjustment looks like:
//   { price: 1350, listPrice: 1300, priceAdjusted: true, priceReason: "…", subtotal: price × qty, … }
// A normal line has no listPrice/priceAdjusted/priceReason.
//
// Shared by the app (cart) and the server (lib/orderCreation.js), so both
// compute the same line total.

const { parseDecimal } = require("./qty");

const REASON_MAX = 200;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ---- App cart lines --------------------------------------------------
// A cart line: { productId, name, unit, qty, freeSample, listPrice,
//                priceAdjusted, customPrice (text while typing), priceReason }

// A new cart line's price fields, from a catalog price.
function freshPriceFields(listPrice) {
  return { listPrice: listPrice ?? null, priceAdjusted: false, customPrice: "", priceReason: "" };
}

// A saved invoice line → cart line (for editing an invoice).
function cartLineFromOrderLine(it) {
  return {
    ...it,
    listPrice: it.priceAdjusted ? it.listPrice : it.price,
    priceAdjusted: Boolean(it.priceAdjusted),
    customPrice: it.priceAdjusted ? String(it.price) : "",
    priceReason: it.priceReason || "",
  };
}

// The price that will be charged per unit for this cart line.
function effectivePrice(it) {
  if (it.priceAdjusted) {
    const n = parseDecimal(it.customPrice);
    if (Number.isFinite(n)) return round2(n);
  }
  return it.listPrice ?? it.price ?? 0;
}

function cartLineTotal(it) {
  if (it.freeSample) return 0; // free sample: no charge, stock still moves
  return round2(effectivePrice(it) * it.qty);
}

// What's wrong with a cart line's adjustment, or "" if nothing.
function priceProblem(it) {
  if (!it.priceAdjusted || it.freeSample) return "";
  const n = parseDecimal(it.customPrice);
  if (!Number.isFinite(n)) return "اكتب السعر الجديد";
  if (it.listPrice != null && round2(n) <= it.listPrice) return "السعر الجديد يجب أن يكون أعلى من سعر القائمة — للتخفيض استخدم خصم الفاتورة";
  if (!String(it.priceReason || "").trim()) return "اكتب سبب تعديل السعر";
  return "";
}

// Cart line → what's sent to the server.
function cartLineToPayload(it) {
  const out = { productId: it.productId, qty: it.qty, freeSample: Boolean(it.freeSample) };
  if (it.priceAdjusted && !it.freeSample) {
    out.customPrice = it.customPrice;
    out.priceReason = String(it.priceReason || "").trim();
  }
  return out;
}

// A saved invoice line → what's sent to the server (re-applying it as is).
function orderLineToPayload(it) {
  const out = { productId: it.productId, qty: it.qty, freeSample: Boolean(it.freeSample) };
  if (it.priceAdjusted) {
    out.customPrice = it.price;
    out.priceReason = it.priceReason;
  }
  return out;
}

// ---- Server ------------------------------------------------------------
// Resolves the line's price. `listPrice` is the reference the new price
// must exceed: the catalog price, or — for a line that was already
// adjusted on this invoice — the list price it was adjusted from, so a
// later catalog change can't make an existing adjustment invalid.
// Returns { price, adjustment } where adjustment is null or the extra
// fields to store on the line. Throws a 400 error on a bad adjustment.
function resolveLinePrice(item, listPrice, productName) {
  const fail = (message) => {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
  };
  const raw = item.customPrice;
  if (raw === undefined || raw === null || raw === "" || item.freeSample) {
    return { price: listPrice, adjustment: null };
  }
  const n = parseDecimal(raw);
  if (!Number.isFinite(n) || n < 0) throw fail(`السعر المعدّل لمنتج "${productName}" غير صالح`);
  const price = round2(n);
  if (price === listPrice) return { price: listPrice, adjustment: null }; // no change after all
  if (price < listPrice) {
    throw fail(`لا يمكن تعديل سعر "${productName}" إلى أقل من سعر القائمة — للتخفيض استخدم خصم الفاتورة`);
  }
  const reason = String(item.priceReason || "").trim();
  if (!reason) throw fail(`اكتب سبب تعديل سعر "${productName}"`);
  if (reason.length > REASON_MAX) throw fail("سبب تعديل السعر طويل جدًا");
  return { price, adjustment: { listPrice, priceAdjusted: true, priceReason: reason } };
}

module.exports = {
  REASON_MAX,
  freshPriceFields,
  cartLineFromOrderLine,
  effectivePrice,
  cartLineTotal,
  priceProblem,
  cartLineToPayload,
  orderLineToPayload,
  resolveLinePrice,
};
