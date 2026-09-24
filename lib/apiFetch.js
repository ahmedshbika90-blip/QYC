// Wraps fetch with a timeout and automatic retry, tuned for unreliable
// mobile connections rather than a fast office network. A slow network
// (not just a dead one) is the common case here, so the timeout is
// generous and failures retry with backoff before giving up.
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1200;

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
 * timeout (not on a normal HTTP error response, like a 400 or 403 —
 * those are real answers from the server, not a connection problem).
 * Throws an Error with a ready-to-display Arabic message on final failure.
 */
async function apiFetch(url, options = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(url, options, TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  const friendly = new Error(
    "تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى."
  );
  friendly.cause = lastErr;
  friendly.isNetworkError = true;
  throw friendly;
}

module.exports = { apiFetch };
