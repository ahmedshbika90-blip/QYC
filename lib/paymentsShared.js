// Browser-safe payment constants (lib/payments.js is server-only).
// Banks the accountant can record a payment from. Add a bank here.
const BANKS = [
  { id: "bok", label: "بنك الخرطوم" },
  { id: "nile", label: "بنك النيل" },
  { id: "onb", label: "بنك أم درمان الوطني" },
  { id: "faisal", label: "بنك فيصل الإسلامي" },
];
const BANK_IDS = BANKS.map((b) => b.id);
const BANK_LABELS = Object.fromEntries(BANKS.map((b) => [b.id, b.label]));

module.exports = { BANKS, BANK_IDS, BANK_LABELS };
