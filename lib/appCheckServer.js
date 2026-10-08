// Server side of Firebase App Check (see lib/appCheckClient.js).
//   APP_CHECK=off      (default) nothing is checked
//   APP_CHECK=monitor  checked and logged, never refused — use this first
//                      to see that real phones pass before enforcing
//   APP_CHECK=enforce  requests without a valid token are refused (403)
// Verified tokens are remembered until they expire, so a busy screen
// doesn't verify the same token on every call.

const { admin } = require("./firebaseAdmin");

const seen = new Map(); // token -> expiry (ms)

function mode() {
  const m = String(process.env.APP_CHECK || "off").toLowerCase();
  return ["monitor", "enforce"].includes(m) ? m : "off";
}

async function verify(token) {
  const hit = seen.get(token);
  if (hit && hit > Date.now()) return true;
  const res = await admin.appCheck().verifyToken(token);
  seen.set(token, (res.token?.exp || 0) * 1000 || Date.now() + 5 * 60e3);
  if (seen.size > 5000) seen.clear();
  return true;
}

/** Throws a 403 in enforce mode when the request has no valid App Check token. */
async function checkAppCheck(req) {
  const m = mode();
  if (m === "off") return;
  const token = req.headers["x-firebase-appcheck"];
  let ok = false;
  if (token) {
    try {
      ok = await verify(String(token));
    } catch {
      ok = false;
    }
  }
  if (ok) return;
  if (m === "monitor") {
    console.warn(`[appCheck] ${token ? "invalid" : "missing"} token on ${(req.url || "").split("?")[0]}`);
    return;
  }
  const err = new Error("تعذر التحقق من التطبيق — حدّث الصفحة وأعد المحاولة");
  err.statusCode = 403;
  err.appCheck = true;
  throw err;
}

module.exports = { checkAppCheck, appCheckMode: mode };
