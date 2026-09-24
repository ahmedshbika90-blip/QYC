const { adminAuth } = require("./firebaseAdmin");

/**
 * Verifies the Firebase ID token sent in the Authorization header
 * ("Bearer <token>") and returns the decoded token (including custom
 * claims like `role`). Throws if missing/invalid.
 *
 * Roles used in this project: "agent_car1" | "agent_car2" | "supervisor"
 */
async function requireUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    const err = new Error("Missing Authorization header");
    err.statusCode = 401;
    throw err;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded; // decoded.role should be set via custom claims
  } catch (e) {
    const err = new Error("Invalid or expired token");
    err.statusCode = 401;
    throw err;
  }
}

function requireRole(decoded, allowedRoles) {
  if (!allowedRoles.includes(decoded.role)) {
    const err = new Error("Forbidden: insufficient role");
    err.statusCode = 403;
    throw err;
  }
}

module.exports = { requireUser, requireRole };
