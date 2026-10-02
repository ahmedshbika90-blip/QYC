// Invoice-level discount — ONE amount off the whole invoice (e.g. 10000),
// never a percentage and never per product. Every place that reads money
// off an invoice (totals, sales report, operating margin, client totals)
// goes through these helpers, so a discount can't be counted in one
// screen and forgotten in another.
//
// Stored on the invoice as:
//   subtotal   sum of the lines (qty × price)
//   discount   the amount off (0 when none)
//   total      subtotal − discount   ← what the client pays
//
// Older invoices have no `subtotal`/`discount` fields: their `total` is
// already final (any old per-line discount or free sample is baked into
// the line subtotals), so they read as discount 0 and stay exactly as
// they were.

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function linesSubtotal(items) {
  return round2((items || []).reduce((sum, it) => sum + Number(it.subtotal ?? it.price * it.qty ?? 0), 0));
}

function orderDiscount(order) {
  return round2(Number(order?.discount) || 0);
}

function orderSubtotal(order) {
  if (typeof order?.subtotal === "number") return order.subtotal;
  return linesSubtotal(order?.items);
}

function hasDiscount(order) {
  return orderDiscount(order) > 0;
}

// Validates a discount typed by an agent against the lines it applies to.
// Returns { subtotal, discount, total } or throws a 400 with an Arabic message.
function applyInvoiceDiscount(items, rawDiscount) {
  const subtotal = linesSubtotal(items);
  let discount = 0;
  if (rawDiscount !== undefined && rawDiscount !== null && rawDiscount !== "") {
    const n = Number(String(rawDiscount).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٫,]/g, "."));
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error("قيمة الخصم يجب أن تكون رقمًا موجبًا");
      err.statusCode = 400;
      throw err;
    }
    discount = round2(n);
  }
  if (discount > subtotal) {
    const err = new Error(`الخصم (${discount}) أكبر من إجمالي الفاتورة (${subtotal})`);
    err.statusCode = 400;
    throw err;
  }
  return { subtotal, discount, total: round2(subtotal - discount) };
}

// Spreads the invoice discount across its lines in proportion to each
// line's value, for per-product figures (operating margin). The pieces
// always add up to exactly the discount (rounding remainder goes to the
// largest line), so per-product revenue sums to the invoice total.
function netLines(order) {
  const items = order?.items || [];
  const discount = orderDiscount(order);
  const gross = items.map((it) => Number(it.subtotal ?? it.price * it.qty ?? 0));
  const sum = gross.reduce((a, b) => a + b, 0);
  if (!discount || !sum) return items.map((it, i) => ({ ...it, netSubtotal: round2(gross[i]) }));
  const shares = gross.map((g) => round2((discount * g) / sum));
  const diff = round2(discount - shares.reduce((a, b) => a + b, 0));
  if (diff) {
    const biggest = gross.indexOf(Math.max(...gross));
    shares[biggest] = round2(shares[biggest] + diff);
  }
  return items.map((it, i) => ({ ...it, netSubtotal: round2(gross[i] - shares[i]), discountShare: shares[i] }));
}

module.exports = { round2, linesSubtotal, orderSubtotal, orderDiscount, hasDiscount, applyInvoiceDiscount, netLines };
