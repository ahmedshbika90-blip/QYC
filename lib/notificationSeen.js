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
