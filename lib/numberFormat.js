// Thousands separators while typing: "1234567" shows as "1,234,567" so a
// missing or extra zero is obvious at a glance. The value kept by the app
// stays the plain number string ("1234567").

/** "1234567.5" → "1,234,567.5" (keeps a trailing "." while typing). */
function groupDigits(raw) {
  const s = String(raw ?? "");
  if (!s) return "";
  const [int, ...rest] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

/**
 * Where the caret should go after reformatting: same number of digits (and
 * dot) to its left as before, so typing in the middle doesn't jump.
 */
function caretAfterFormat(formatted, digitsBefore) {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i])) seen += 1;
    if (seen === digitsBefore) return i + 1;
  }
  return formatted.length;
}

const countDigits = (text) => (String(text).match(/[\d.٠-٩۰-۹٫]/g) || []).length;

module.exports = { groupDigits, caretAfterFormat, countDigits };
