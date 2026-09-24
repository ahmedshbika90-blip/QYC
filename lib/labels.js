// Display-only Arabic labels. The underlying values stored in Firestore
// and sent to the API stay in English ("pending", "car1", etc.) so nothing
// here has to touch validation logic — only what the user reads changes.

// "pending" stays only as the brief internal state between an order being
// created and the agent marking its outcome — the agent only ever chooses
// between "delivered" and "cancelled" once they've handled it.
const STATUS_LABELS = {
  pending: "قيد الانتظار",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

const ROUTE_LABELS = {
  car1: "السيارة ١ (حسب الطلب)",
  car2: "السيارة ٢ (خط أسبوعي ثابت)",
};

const ROLE_LABELS = {
  agent_car1: "مندوب السيارة ١",
  agent_car2: "مندوب السيارة ٢",
  supervisor: "المشرف",
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

module.exports = { STATUS_LABELS, ROUTE_LABELS, ROLE_LABELS, formatDate, formatDateTime };
