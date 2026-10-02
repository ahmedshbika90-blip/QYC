const PHONE_PATTERN = /^0\d{9}$/;

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits → English 0-9. A phone typed
// on an Arabic keyboard is the same number; it must be stored in ONE
// format, so every entry point converts before checking or saving.
function toEnglishDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Digits only, English, at most 10 — what a phone field holds.
function normalizePhone(value) {
  return toEnglishDigits(value).replace(/\D/g, "").slice(0, 10);
}

function isValidPhone(phone) {
  return typeof phone === "string" && PHONE_PATTERN.test(phone);
}

module.exports = { PHONE_PATTERN, isValidPhone, toEnglishDigits, normalizePhone };
