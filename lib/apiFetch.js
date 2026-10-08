// Wraps fetch with a timeout and automatic retry, tuned for unreliable
// mobile connections. A slow network (not just a dead one) is the common
// case in Sudan, so the timeout is generous and failures retry with
// backoff before giving up.
//
// Retrying writes (POST/PATCH) is safe: every create action carries a
// request ID the server uses to ignore duplicates, and every other action
// (confirm, cancel, approve, edit) is safe to repeat.
//
// It also broadcasts connection health ("net-status" events) so the
// ConnectionBanner can tell people what's happening: slow, retrying, or
// can't reach the server — instead of an unexplained spinner.
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1200;
const SLOW_AFTER_MS = 4000;

const state = { slow: 0, retrying: 0, failed: false };

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("net-status", {
      detail: { slow: state.slow > 0, retrying: state.retrying > 0, failed: state.failed },
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drop-in replacement for fetch() that retries on network failure or
 * timeout (not on a normal HTTP error like 400/403 — those are real
 * answers from the server). Throws an Error with a ready-to-display
 * Arabic message (and isNetworkError = true) on final failure.
 */
async function apiFetch(url, options = {}) {
  // App Check token (only when configured; see lib/appCheckClient.js).
  if (process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY && typeof url === "string" && url.startsWith("/api/")) {
    const extra = await require("./appCheckClient").appCheckHeader();
    if (extra["X-Firebase-AppCheck"]) options = { ...options, headers: { ...(options.headers || {}), ...extra } };
  }
  const isWrite = options.method && options.method !== "GET";
  let markedSlow = false;
  const slowTimer = setTimeout(() => {
    markedSlow = true;
    state.slow++;
    emit();
  }, SLOW_AFTER_MS);

  let lastErr;
  let retryingMarked = false;
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetchWithTimeout(url, options, TIMEOUT_MS);
        if (state.failed) state.failed = false; // server reachable again
        // 401 = the server no longer accepts this login (account disabled,
        // role changed or password reset by the admin, or a stale token).
        // lib/useAuth.js listens and either renews the token or signs out.
        if (res.status === 401 && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("auth-rejected", { detail: { revoked: res.headers.get("X-Session-Revoked") === "1" } }));
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          if (!retryingMarked) {
            retryingMarked = true;
            state.retrying++;
            emit();
          }
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
    state.failed = true;
    const friendly = new Error(
      isWrite
        ? "تعذر التأكد من الإرسال بسبب ضعف الاتصال. تحقق من الإنترنت ثم أعد المحاولة — إعادة المحاولة آمنة ولن تتكرر العملية."
        : "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة."
    );
    friendly.cause = lastErr;
    friendly.isNetworkError = true;
    throw friendly;
  } finally {
    clearTimeout(slowTimer);
    if (markedSlow) state.slow--;
    if (retryingMarked) state.retrying--;
    emit();
  }
}

module.exports = { apiFetch };
