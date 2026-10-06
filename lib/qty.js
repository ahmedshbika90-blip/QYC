// Quantities are WHOLE numbers everywhere in the system — no fractions in
// orders, loading, transfers, receiving, damaged goods or stock balances.
// One place decides how a quantity is parsed and validated, so the client
// and the server can never disagree about what a typed quantity means.
//
// Money (prices, unit cost, discount) still has decimals — that goes
// through parseDecimal below, not parseQty.

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits → English 0-9.
function toEnglishDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Accepts what people actually type on a phone: Western or Arabic-Indic
// digits, and "." or the Arabic decimal separator "٫" or a comma as the
// decimal point. Returns a Number, or NaN if it isn't one. For MONEY.
function parseDecimal(input) {
  if (typeof input === "number") return input;
  if (input === null || input === undefined) return NaN;
  const s = toEnglishDigits(input).trim().replace(/[٫,]/g, ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return NaN;
  return Number(s);
}

// What a money field holds while typing: English digits and at most one
// "." — Arabic digits and "٫" / "," are converted as they are typed.
function cleanMoneyInput(text) {
  const s = toEnglishDigits(text).replace(/[٫,]/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  return dot === -1 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
}

// A money field when the person leaves it: always two decimals
// ("1500" → "1500.00", "12.5" → "12.50"), so a slipped digit or a missing
// decimal point is visible before saving. Empty stays empty.
function money2(text) {
  const s = cleanMoneyInput(text);
  if (s === "" || s === ".") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : s;
}

// What a quantity field holds while typing: English digits only.
function cleanQtyInput(text) {
  return toEnglishDigits(text).replace(/\D/g, "");
}

// A quantity: a whole number, or NaN. "2.5", "2٫5" or "1.0" are NOT
// accepted — a fraction is refused, never silently rounded.
function parseQty(input) {
  if (typeof input === "number") return Number.isInteger(input) ? input : NaN;
  if (input === null || input === undefined) return NaN;
  const s = toEnglishDigits(input).trim();
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

// A usable movement/order quantity: a whole number above zero.
function isValidQty(value) {
  const n = parseQty(value);
  return Number.isInteger(n) && n > 0;
}

// Stock balances are sums of whole numbers, so this only guards against
// floating-point noise in balances recorded before whole-numbers-only.
function roundQty(n) {
  return Math.round(Number(n) * 100) / 100;
}

module.exports = { toEnglishDigits, parseDecimal, cleanMoneyInput, money2, cleanQtyInput, parseQty, isValidQty, roundQty };
