// Device-level idle session.
//
// The last-activity time is saved on the DEVICE (localStorage), not kept
// in a page timer. A page timer stops when the phone locks, the browser is
// closed, or the tab is backgrounded — and Firebase keeps the login saved
// on the device — so reopening the app the next day would restore the
// session as if nothing happened. Storing the timestamp on the device
// means the check still works after any amount of time away:
//   - on every app open (before any data loads)
//   - whenever the app comes back to the screen
//   - every 30 seconds while it's open
// It's shared across tabs on the same device, so activity in one tab keeps
// the device session alive; inactivity everywhere ends it.

export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const KEY = "lastActivityAt";

export function markActivity() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage unavailable — the in-page check below still applies
  }
}

// True if this device has been inactive longer than the timeout, or has no
// activity record at all (e.g. a login that predates this check) — in
// which case the safe choice is to require a fresh sign-in.
export function isSessionExpired() {
  try {
    const last = Number(localStorage.getItem(KEY));
    if (!last) return true;
    return Date.now() - last > IDLE_TIMEOUT_MS;
  } catch {
    return false;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
