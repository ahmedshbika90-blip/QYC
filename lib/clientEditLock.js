// Agents can edit a client's details freely for the first 12 hours after
// registering them — enough to fix a typo'd phone number or a wrong store
// class the same day. After that, the details are part of the record
// (invoices, routes and reports already rely on them), so an agent's edit
// becomes a REQUEST the supervisor approves before anything changes.
// The supervisor can always edit directly.
//
// Shared by the API (which enforces it) and the client page (which shows
// the right form), so the two can't disagree about when the window closes.

const CLIENT_EDIT_WINDOW_HOURS = 12;
const WINDOW_MS = CLIENT_EDIT_WINDOW_HOURS * 60 * 60 * 1000;

function clientEditDeadline(client) {
  const created = Date.parse(client?.createdAt || "");
  return Number.isFinite(created) ? new Date(created + WINDOW_MS) : null;
}

// A client with no readable registration time is treated as locked — an
// old record is exactly the kind that shouldn't change without review.
function isClientEditLocked(client, now = Date.now()) {
  const deadline = clientEditDeadline(client);
  return !deadline || now >= deadline.getTime();
}

module.exports = { CLIENT_EDIT_WINDOW_HOURS, clientEditDeadline, isClientEditLocked };
