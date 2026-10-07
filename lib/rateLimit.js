// Rate limit for the two public, no-login endpoints (/api/orders/create
// and /api/clients/lookup-route): without it, a script could loop through
// all 10,000 client IDs to find real ones, or flood orders at a known ID.
//
// Where the counters live:
//   - Upstash Redis, when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
//     are set (or the KV_REST_API_URL / KV_REST_API_TOKEN names the Vercel
//     marketplace integration creates). One small HTTP call per request,
//     shared by every server instance, no Firestore reads or writes.
//   - Otherwise (or if Redis doesn't answer within 800 ms): in the server
//     instance's memory. Each instance then counts on its own — weaker
//     against a determined attacker spread over many instances, but never
//     fails open and never costs a Firestore read+write per request, which
//     the old Firestore counter did.
//
// Fixed window: at most `maxRequests` per `windowMs` per key.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const REDIS_TIMEOUT_MS = 800;

const memory = new Map(); // key -> { count, resetAt }
let lastSweep = 0;

function memoryHit(key, { maxRequests, windowMs }, now = Date.now()) {
  if (now - lastSweep > 60 * 1000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    lastSweep = now;
  }
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= maxRequests;
}

async function redisHit(key, { maxRequests, windowMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(`${REDIS_URL.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      // INCR, and start the window's clock only on its first request.
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"],
      ]),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const [incr] = await res.json();
    if (incr?.error || typeof incr?.result !== "number") throw new Error(incr?.error || "bad Upstash reply");
    return incr.result <= maxRequests;
  } finally {
    clearTimeout(timer);
  }
}

/** true = allowed, false = too many requests. */
async function checkRateLimit(key, limits) {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      return await redisHit(key, limits);
    } catch (err) {
      console.warn(`[rateLimit] Redis unavailable (${err.message}) — counting in memory`);
    }
  }
  return memoryHit(key, limits);
}

/** Best-effort client IP, for rate-limiting requests that have no login. */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = { checkRateLimit, getClientIp, rateLimitBackend: () => (REDIS_URL && REDIS_TOKEN ? "upstash" : "memory") };
