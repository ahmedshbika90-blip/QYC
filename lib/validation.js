const PHONE_PATTERN = /^0\d{9}$/;

function isValidPhone(phone) {
  return typeof phone === "string" && PHONE_PATTERN.test(phone);
}

module.exports = { PHONE_PATTERN, isValidPhone };
