// Quantities can be fractional (e.g. 2.5 كيلو, 0.25 كرتون). One place
// decides how a quantity is parsed, rounded and validated, so the client
// and the server can never disagree about what "1.5" means.
//
// Precision: 2 decimal places. Every quantity is rounded to that on the way
// in, and every stock balance is rounded on the way out (lib/inventory.js),
// so floating-point noise like 0.1 + 0.2 = 0.30000000000000004 never
// reaches the database or the screen.

const QTY_DECIMALS = 2;
const FACTOR = 10 ** QTY_DECIMALS;

function roundQty(n) {
  return Math.round(Number(n) * FACTOR) / FACTOR;
}

// Accepts what people actually type on a phone: Western or Arabic-Indic
// digits (٠-٩, ۰-۹), and "." or the Arabic decimal separator "٫" or a
// comma as the decimal point. Returns a Number, or NaN if it isn't one.
function parseDecimal(input) {
  if (typeof input === "number") return input;
  if (input === null || input === undefined) return NaN;
  const s = String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return NaN;
  return Number(s);
}

// A usable movement/order quantity: a finite number above zero after
// rounding to the supported precision.
function isValidQty(value) {
  const n = parseDecimal(value);
  return Number.isFinite(n) && roundQty(n) > 0;
}

module.exports = { QTY_DECIMALS, roundQty, parseDecimal, isValidQty };
