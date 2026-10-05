// Current interface language, readable from anywhere (including CommonJS
// modules shared with the server, like lib/labels.js). Always "ar" on the
// server; in the browser lib/i18n.js sets it.
let lang = "ar";

function getLang() {
  return typeof window === "undefined" ? "ar" : lang;
}
function setLangState(next) {
  lang = next === "en" ? "en" : "ar";
}
// Locale for dates. Digits stay Western in both (see lib/labels.js).
function locale() {
  return getLang() === "en" ? "en-GB" : "ar-EG";
}

module.exports = { getLang, setLangState, locale };
