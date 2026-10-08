import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { markSeen, loginSession } from "../lib/notificationSeen";

// The prompt shown when the app is OPENED, listing what's going on: what
// the item is, who it's from, its state (and the note, when there is one),
// tapping one goes straight to it. The rule, everywhere, for every role:
//
//  - Needs your action (pending)  → shown EVERY time the app is opened,
//    until it's actually resolved. It's still an open task.
//  - Already resolved (approved / rejected / fulfilled / cancelled)
//    → shown ONCE. The moment it appears in this prompt it's marked seen
//    (lib/notificationSeen), so it never comes back — whether the person
//    closes the prompt, opens another item, or just navigates away.
//
// "Opened" means a fresh load of the app (a module-level flag, reset on
// every full page load — NOT sessionStorage, which a PWA or a restored
// tab can keep for days), or coming back to it after it sat in the
// background for a while.
const RESUME_AFTER_MS = 10 * 60 * 1000;
let shownFor = null; // "uid:signInNumber" whose prompt has already been decided in this open
let hiddenAt = null;

export default function PendingActionModal({ role, uid, items, loaded, refreshSeen }) {
  const router = useRouter();
  const [visibleItems, setVisibleItems] = useState(null); // frozen list while open

  // Decide once per "open", as soon as the first notifications fetch lands.
  useEffect(() => {
    const key = `${uid}:${loginSession()}`;
    if (!role || !uid || !loaded || shownFor === key) return;
    shownFor = key;
    if (!items.length) return;
    // Pending first — they're the ones that need something done.
    const list = [...items].sort((a, b) => Number(b.needsAction) - Number(a.needsAction));
    // Resolved items have now been shown: never show them again.
    list.filter((it) => !it.needsAction).forEach((it) => markSeen(uid, it.id));
    refreshSeen?.();
    setVisibleItems(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, uid, loaded, items]);

  // Returning to the app after a while counts as opening it again — only
  // still-pending items can reappear, since resolved ones are already seen.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt >= RESUME_AFTER_MS) {
        hiddenAt = null;
        const pending = (items || []).filter((it) => it.needsAction);
        if (pending.length) setVisibleItems(pending);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [items]);

  // Escape closes it.
  useEffect(() => {
    if (!visibleItems) return;
    const onKey = (e) => e.key === "Escape" && setVisibleItems(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleItems]);

  if (!visibleItems || visibleItems.length === 0) return null;

  const pendingCount = visibleItems.filter((it) => it.needsAction).length;

  function openItem(item) {
    setVisibleItems(null);
    router.push(item.href);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pending-title" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full max-h-[80vh] flex flex-col">
        <div className="p-5 pb-3">
          <p id="pending-title" className="font-display text-lg font-bold text-ink">
            لديك {visibleItems.length} {visibleItems.length === 1 ? "إشعار" : "إشعارات"}
          </p>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              {pendingCount} بحاجة لإجراء منك — ستظهر في كل مرة تفتح فيها التطبيق حتى تُنجَز.
            </p>
          )}
        </div>
        <div className="overflow-y-auto px-2 space-y-1">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              className="w-full text-start p-3 rounded-xl hover:bg-surface-2 active:bg-surface-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink truncate">{item.requestType}</p>
                <p className="text-xs text-muted">من: {item.from}</p>
                {item.note && (
                  <p className={`text-xs mt-0.5 line-clamp-2 ${item.tone === "bad" ? "text-red-600" : "text-ink-soft"}`}>
                    {item.note}
                  </p>
                )}
              </div>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${
                  item.needsAction
                    ? "bg-amber-50 text-amber-700"
                    : item.tone === "bad"
                    ? "bg-red-50 text-red-600"
                    : "bg-green-50 text-green-700"
                }`}
              >
                {item.state}
              </span>
            </button>
          ))}
        </div>
        <div className="p-4">
          <button
            type="button"
            onClick={() => setVisibleItems(null)}
            className="w-full h-12 rounded-2xl bg-surface-2 text-ink font-semibold text-sm"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
