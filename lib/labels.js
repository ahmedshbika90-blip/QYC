// Display-only Arabic labels. The underlying values stored in Firestore
// and sent to the API stay in English ("pending", "car1", etc.) so nothing
// here has to touch validation logic — only what the user reads changes.

// An invoice is either active or cancelled — no multi-step workflow.
// "pending"/"delivered" are kept mapped here only so any invoice created
// before this simplification still displays sensibly instead of showing
// a blank/undefined label; new invoices are never given those values.
const STATUS_LABELS = {
  active: "نشطة",
  pending: "نشطة",
  delivered: "نشطة",
  cancelled: "ملغاة",
};

// Store classification set by staff at registration — used for filtering
// clients and invoices (e.g. "show me only class A stores").
const STORE_CLASSES = ["A", "B", "C"];

// car1/car2 stay as internal route keys everywhere (Firestore fields, API
// params, roles) — only the Arabic label read by staff changed, from
// "السيارة ١/٢" to the wholesale/retail names used in real business
// conversations (car1 = wholesale, car2 = retail).
const ROUTE_LABELS = {
  car1: "مبيعات جملة (حسب الطلب)",
  car2: "مبيعات تجزئة (خط أسبوعي ثابت)",
};

const ROUTE_LABELS_SHORT = {
  car1: "مبيعات جملة",
  car2: "مبيعات تجزئة",
};

const ROLE_LABELS = {
  agent_car1: "مندوب مبيعات الجملة",
  agent_car2: "مندوب مبيعات التجزئة",
  supervisor: "المشرف",
  warehouse_keeper: "أمين المخزن",
  // View-only over the main depot's balances — no receiving, no loading,
  // no editing. Added for a specific staff member who only needs to see
  // depot stock levels.
  depot_viewer: "مطّلع على المخزن الرئيسي",
};

// Forces the Gregorian calendar explicitly — some browsers default Arabic
// locales to the Hijri calendar, which would silently scramble delivery
// dates. Numerals stay Western (١٢٣ vs 123) is avoided on purpose too,
// since phone numbers / IDs / prices are read digit-by-digit in daily
// business use and mixing numeral systems there causes real mistakes.
const DATE_OPTS = { calendar: "gregory", numberingSystem: "latn" };

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ar-EG", {
    ...DATE_OPTS,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ar-EG", {
    ...DATE_OPTS,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// One shared number format for every price/total shown in the app — always
// two decimal places with a thousands separator (e.g. 1,250.50), so a
// price never displays as a bare integer in one screen and with decimals
// in another. Numerals stay Western (see DATE_OPTS above) for the same
// reason: prices are read digit-by-digit in daily business use.
function formatNumber(value, { decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "٠";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Quantities (units moved/held). Fractional quantities are allowed (see
// lib/qty.js), so this shows up to 2 decimal places — but only when there
// are any: 12 stays "12", 2.5 shows "2.5", 1.25 shows "1.25".
function formatQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "٠";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

module.exports = {
  STATUS_LABELS,
  ROUTE_LABELS,
  ROUTE_LABELS_SHORT,
  ROLE_LABELS,
  STORE_CLASSES,
  formatDate,
  formatDateTime,
  formatNumber,
  formatQty,
};
