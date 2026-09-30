import { useRouter } from "next/router";
import { markSeen } from "../lib/notificationSeen";
import Icon from "./Icon";

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
          className="bg-white shadow-lg rounded-2xl p-3 flex items-start gap-3"
        >
          <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Icon name="bell" size={18} />
          </span>
          <button onClick={() => open(t)} className="flex-1 text-start min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{t.requestType}</p>
            <p className="text-xs text-gray-500 truncate">
              من: {t.from} · {t.state}
            </p>
          </button>
          <button
            onClick={() => onDismiss(t._toastId)}
            className="w-9 h-9 rounded-lg text-gray-400 flex items-center justify-center shrink-0 active:bg-surface-2"
            aria-label="إغلاق"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
