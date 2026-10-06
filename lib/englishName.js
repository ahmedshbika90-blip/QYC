// Optional English name (products, people) shown when the app is in English.
// Latin letters, digits, spaces and simple punctuation; up to 80 characters.
const EN_RE = /^[A-Za-z0-9 .,'&()\/+-]*$/;

function cleanEnglishName(v) {
  if (v === undefined) return undefined;
  if (v === null) return "";
  if (typeof v !== "string") {
    const e = new Error("الاسم بالإنجليزية غير صالح");
    e.statusCode = 400;
    throw e;
  }
  const s = v.trim().replace(/\s+/g, " ");
  if (s.length > 80 || !EN_RE.test(s)) {
    const e = new Error("الاسم بالإنجليزية: حروف إنجليزية وأرقام فقط، حتى 80 حرفًا");
    e.statusCode = 400;
    throw e;
  }
  return s;
}

module.exports = { cleanEnglishName };
