// Removes personal data from error reports before they leave the device or
// server (lib/monitor.js, lib/clientMonitor.js). Pure functions, no imports.

// 09xxxxxxxx / 01xxxxxxxx (10 digits), +249…, 249… — masked to …
const PHONE = /(\+?249|0)\d{8,9}\b/g;
// Arabic names inside «…» or "…" (how our messages quote a client).
const QUOTED = /[«"“]([^»"”]{1,80})[»"”]/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
function scrubText(s) {
  return String(s || "")
    .replace(PHONE, "[phone]")
    .replace(EMAIL, "[email]")
    .replace(QUOTED, "«…»");
}

function scrubEvent(event) {
  delete event.user;
  delete event.request?.data;
  delete event.request?.cookies;
  delete event.request?.headers;
  if (event.request) {
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  delete event.server_name;
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values || []) ex.value = scrubText(ex.value);
  event.breadcrumbs = (event.breadcrumbs || [])
    .filter((b) => b.category !== "console" && !String(b.category || "").startsWith("ui."))
    .map((b) => ({ ...b, message: scrubText(b.message), data: b.data?.url ? { url: String(b.data.url).split("?")[0], method: b.data.method, status_code: b.data.status_code } : undefined }));
  delete event.extra;
  return event;
}

module.exports = { scrubText, scrubEvent };
