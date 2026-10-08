const PREFIX = "notifSeen";

function key(uid, itemId) {
  return `${PREFIX}:${uid}:${itemId}`;
}

export function isSeen(uid, itemId) {
  try {
    return localStorage.getItem(key(uid, itemId)) === "1";
  } catch {
    return false;
  }
}

export function markSeen(uid, itemId) {
  try {
    localStorage.setItem(key(uid, itemId), "1");
  } catch {
    // ignore — private browsing etc.; worst case the notification shows
    // again next time, which is safe (just slightly repetitive)
  }
}

// Each sign-in is a new "opening" of the app for the sign-in prompt
// (components/PendingActionModal.js), even without a full page reload —
// signing out and back in on the same tab must show it again.
let loginSeq = 0;
export function newLoginSession() {
  loginSeq += 1;
}
export function loginSession() {
  return loginSeq;
}
