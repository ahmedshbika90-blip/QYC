import { useRouter } from "next/router";
import { markSeen } from "../lib/notificationSeen";

// Small, non-blocking, top-of-screen — the opposite of the full-screen
// prompt. That one greets you once per session with everything
// outstanding; this one just pokes you the moment something happens
// while you're already in the app (a new request came in, yours just
// got decided, a shipment is ready).
export default function NotificationToastStack({ toasts, uid, onDismiss, refreshSeen }) {
  const router = useRouter();

  if (!toasts.length) return null;

  function open(t) {
    if (!t.needsAction) {
      markSeen(uid, t.id);
      refreshSeen();
    }
    onDismiss(t._toastId);
    router.push(t.href);
  }

  return (
    <div className="fixed top-3 inset-x-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:end-3 sm:w-80">
      {toasts.map((t) => (
        <div
          key={t._toastId}
          className="bg-white shadow-lg border rounded-lg p-3 flex items-start gap-2"
        >
          <button onClick={() => open(t)} className="flex-1 text-start min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{t.requestType}</p>
            <p className="text-xs text-gray-500 truncate">
              من: {t.from} · {t.state}
            </p>
          </button>
          <button
            onClick={() => onDismiss(t._toastId)}
            className="text-gray-400 text-lg leading-none px-1 shrink-0"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
