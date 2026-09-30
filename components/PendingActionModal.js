import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { markSeen } from "../lib/notificationSeen";

const SEEN_KEY = "pendingActionsPromptShown";

// Shown once per browser session — not on every page navigation. Lists
// what's actually going on rather than just a number: what the request
// is, who it's from, and its state, and tapping one goes straight to it.
//
// A still-pending item is never marked "seen" (see lib/notificationSeen),
// so it naturally keeps showing up every session until it's actually
// resolved — that's the point, it's still an open task. A resolved item
// (rejected/approved/fulfilled) is informational only: opening it, or
// just dismissing this prompt, marks it seen and it won't come back.
export default function PendingActionModal({ role, uid, items, refreshSeen }) {
  const router = useRouter();
  const [dismissedThisSession, setDismissedThisSession] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!role) return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // private browsing etc. — treat as not yet shown
    }
    setDismissedThisSession(shown);
    setChecked(true);
  }, [role]);

  if (!checked || dismissedThisSession || items.length === 0) return null;

  function markShownThisSession() {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setDismissedThisSession(true);
  }

  function close() {
    // Dismissing counts as "seen" for anything already resolved — a
    // pending item is untouched and will simply reappear once its
    // needsAction flag flips to resolved.
    items.filter((it) => !it.needsAction).forEach((it) => markSeen(uid, it.id));
    refreshSeen();
    markShownThisSession();
  }

  function openItem(item) {
    if (!item.needsAction) markSeen(uid, item.id);
    markShownThisSession();
    router.push(item.href);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full max-h-[80vh] flex flex-col">
        <div className="p-5 pb-3">
          <p className="text-lg font-semibold text-gray-800">
            لديك {items.length} {items.length === 1 ? "إشعار" : "إشعارات"}
          </p>
        </div>
        <div className="overflow-y-auto px-2 space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              className="w-full text-start p-3 rounded-lg active:bg-gray-100 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-base text-gray-800 truncate">{item.requestType}</p>
                <p className="text-xs text-gray-400">من: {item.from}</p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-lg shrink-0 ${
                  item.needsAction ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                {item.state}
              </span>
            </button>
          ))}
        </div>
        <div className="p-4">
          <button onClick={close} className="w-full text-gray-500 h-11 text-sm">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
