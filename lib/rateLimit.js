const { adminDb } = require("./firebaseAdmin");

/**
 * Sliding-window rate limit backed by a single Firestore doc per key.
 * Returns true if the request is allowed, false if it should be rejected.
 * Uses a transaction so concurrent requests can't race past the limit.
 *
 * This exists specifically to protect the two public, no-login endpoints
 * (/api/orders/create and /api/clients/lookup-route) from abuse — without
 * it, a script could loop through all 10,000 possible client IDs to
 * enumerate real ones, or flood fake orders at a known client ID, and
 * nothing would stop it.
 */
async function checkRateLimit(key, { maxRequests, windowMs }) {
  const ref = adminDb.collection("rateLimits").doc(key);
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    if (!data || now - data.windowStart > windowMs) {
      tx.set(ref, { count: 1, windowStart: now });
      return true;
    }

    if (data.count >= maxRequests) {
      return false;
    }

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

/** Best-effort client IP, for rate-limiting requests that have no login. */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = { checkRateLimit, getClientIp };
