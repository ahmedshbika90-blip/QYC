// A unique ID generated on the device for each "create" action (invoice,
// client, product, inventory document). If a weak connection causes the
// same submission to reach the server twice — e.g. the first attempt got
// through but the reply was lost, so the app retried — the server sees the
// same ID and returns the original instead of creating a duplicate.
function newRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}

// Server-side check: IDs become Firestore document IDs, so only allow a
// safe, bounded character set.
function isValidRequestId(id) {
  return typeof id === "string" && /^[A-Za-z0-9-]{16,64}$/.test(id);
}
module.exports = { newRequestId, isValidRequestId };
