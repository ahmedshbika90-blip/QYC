// Server-side error reporting to Sentry — only when SENTRY_DSN is set in
// the environment; otherwise every call here does nothing.
//
// What is sent: the error (type, message, stack), the API route and
// method, the role (not who), and the app version. What is NOT sent:
// request bodies, query strings, headers, cookies, IP addresses, user ids,
// emails — and any client name or phone number that ended up inside an
// error message is masked first (scrubText).
//
// Only real server faults (HTTP 500) are reported; "not allowed", "not
// found", validation messages etc. are normal answers, not errors.

let sentry = null;
let started = false;

const { scrubText, scrubEvent } = require("./scrub");

function start() {
  if (started) return sentry;
  started = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  try {
    // eslint-disable-next-line global-require
    sentry = require("@sentry/nextjs");
    sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: scrubEvent,
    });
  } catch (err) {
    console.warn("[monitor] Sentry not started:", err.message);
    sentry = null;
  }
  return sentry;
}

/**
 * Report a server fault from an API route's catch block. Never throws.
 * With `res`, the error response is held until the report is sent (at most
 * 1.5 s) — a serverless function can be frozen right after it answers, and
 * the report would be lost. Only happens on a real fault, so it's rare.
 */
function reportServerError(err, req, res, extra = {}) {
  try {
    const status = err && err.statusCode;
    if (status && status < 500) return; // a normal "no" to the user, not a fault
    const s = start();
    if (!s) return;
    s.withScope((scope) => {
      scope.setTag("route", (req?.url || "").split("?")[0]);
      scope.setTag("method", req?.method || "");
      if (extra.role) scope.setTag("role", extra.role);
      s.captureException(err);
    });
    if (res && typeof res.end === "function" && !res.__heldForReport) {
      res.__heldForReport = true;
      const end = res.end.bind(res);
      res.end = (...args) => {
        s.flush(1500).catch(() => {}).finally(() => end(...args));
        return res;
      };
    }
  } catch {
    // monitoring must never break a request
  }
}

/** Waits (briefly) for queued reports — serverless functions may stop right after responding. */
async function flushReports(ms = 1500) {
  if (sentry) await sentry.flush(ms).catch(() => {});
}

module.exports = { reportServerError, flushReports, scrubText, scrubEvent };
