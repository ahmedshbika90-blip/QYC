// Loose matching for Arabic names typed on a phone: ignores diacritics,
// tatweel, alef/ya/ta-marbuta spelling variants, extra spaces, and
// Arabic-Indic vs Latin digits — so "الحاج يوسف" finds "الحاج يوسُف" and
// "شارع ١٥" finds "شارع 15".
function normalizeAr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, String.fromCharCode(0x627))
    .replace(/ى/g, String.fromCharCode(0x64a))
    .replace(/ة/g, String.fromCharCode(0x647))
    .replace(/ؤ/g, String.fromCharCode(0x648))
    .replace(/ئ/g, String.fromCharCode(0x64a))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim();
}

/** The option spelled the way it was first saved, if `value` is the same name. */
function findSame(options, value) {
  const n = normalizeAr(value);
  return n ? options.find((o) => normalizeAr(o) === n) || null : null;
}

module.exports = { normalizeAr, findSame };
