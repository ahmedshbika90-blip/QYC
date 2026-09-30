import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { markSeen } from "../lib/notificationSeen";
import Icon from "./Icon";

// Persistent, swipe-dismissable toast stack. Two changes from the old
// version:
//   1) Visibility: bigger card, amber ring + pulsing dot so you can't
//      miss it in your peripheral vision, and it lives at the top-center
//      (not tucked away in a corner). Uses aria-live so screen readers
//      announce it too.
//   2) Persistence: we hold each toast in local state until the USER
//      dismisses it (tap X or swipe horizontally past a threshold). Even
//      if the parent stops passing a toast in — e.g. an old auto-timeout
//      inside useNotifications — we keep showing it. The only way it
//      leaves the screen is a user gesture or opening the item.
//
// NOTE: if useNotifications still schedules auto-removals, remove that
// timeout there too — this component tolerates it, but the cleanest fix
// is to stop dispatching it. (Search for setTimeout(...dismissToast) or
// similar in lib/useNotifications.)
export default function NotificationToastStack({ toasts, uid, onDismiss, refreshSeen }) {
  const router = useRouter();

  // Local list keyed by _toastId. We merge in anything new we see from
  // the parent, but we NEVER drop a toast we've already shown until the
  // user acts on it.
  const [live, setLive] = useState([]);
  const seenIds = useRef(new Set());
  const dismissedIds = useRef(new Set());

  useEffect(() => {
    const incoming = toasts || [];
    // Add any brand-new toasts to our live list (skip ones the user
    // already dismissed in this session).
    setLive((prev) => {
      const known = new Set(prev.map((t) => t._toastId));
      const additions = incoming.filter(
        (t) => !known.has(t._toastId) && !dismissedIds.current.has(t._toastId)
      );
      if (additions.length === 0) return prev;
      additions.forEach((t) => seenIds.current.add(t._toastId));
      return [...prev, ...additions];
    });
  }, [toasts]);

  function remove(toastId) {
    dismissedIds.current.add(toastId);
    setLive((prev) => prev.filter((t) => t._toastId !== toastId));
    // Tell the parent too — harmless if it's already forgotten it.
    try {
      onDismiss?.(toastId);
    } catch {}
  }

  function open(t) {
    if (!t.needsAction) {
      markSeen(uid, t.id);
      refreshSeen?.();
    }
    remove(t._toastId);
    router.push(t.href);
  }

  if (live.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="تنبيهات"
      aria-live="polite"
      className="fixed top-3 inset-x-3 z-50 flex flex-col gap-2.5 pointer-events-none sm:inset-x-auto sm:top-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)]"
    >
      {live.map((t) => (
        <ToastCard key={t._toastId} toast={t} onOpen={() => open(t)} onDismiss={() => remove(t._toastId)} />
      ))}
    </div>
  );
}

// One toast card. Handles the swipe gesture (touch + mouse) using
// pointer events, and translates itself so the swipe feels physical.
// Past the threshold, we snap it off-screen and call onDismiss.
function ToastCard({ toast, onOpen, onDismiss }) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const dragging = useRef(false);
  const decidedAxis = useRef(false); // once we know it's a horizontal swipe, prevent vertical wobble

  const THRESHOLD = 90; // px past which we count it as dismiss
  const AXIS_LOCK = 8;  // px of movement before we decide horizontal vs vertical

  function onPointerDown(e) {
    // Ignore right-clicks and modifier drags.
    if (e.button != null && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    dragging.current = true;
    decidedAxis.current = false;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function onPointerMove(e) {
    if (!dragging.current) return;
    const deltaX = e.clientX - startX.current;
    const deltaY = e.clientY - startY.current;
    if (!decidedAxis.current) {
      if (Math.abs(deltaX) < AXIS_LOCK && Math.abs(deltaY) < AXIS_LOCK) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // Vertical scroll — let the browser have it; abandon the gesture.
        dragging.current = false;
        setDx(0);
        return;
      }
      decidedAxis.current = true;
    }
    setDx(deltaX);
  }

  function endDrag(e) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e?.currentTarget?.releasePointerCapture?.(e.pointerId);
    } catch {}
    if (Math.abs(dx) >= THRESHOLD) {
      // Fly off in the direction the user pushed.
      const off = dx > 0 ? 600 : -600;
      setDx(off);
      setLeaving(true);
      setTimeout(onDismiss, 180);
    } else {
      setDx(0);
    }
  }

  // Opacity fades as the card slides — visual feedback that swiping
  // dismisses it.
  const opacity = Math.max(0, 1 - Math.abs(dx) / 260);
  const transition = dragging.current ? "none" : leaving ? "transform 180ms ease-out, opacity 180ms ease-out" : "transform 220ms cubic-bezier(.2,.9,.3,1), opacity 220ms ease-out";

  return (
    <div className="pointer-events-auto" style={{ touchAction: "pan-y" }}>
      <div
        role="alert"
        className="relative bg-white shadow-xl rounded-2xl ring-2 ring-amber-400/70 border border-amber-100 p-3.5 flex items-start gap-3 select-none"
        style={{ transform: `translateX(${dx}px)`, opacity, transition }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="relative w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Icon name="bell" size={20} />
          <span className="absolute -top-0.5 -end-0.5 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white">
            <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-75" />
          </span>
        </span>

        <button
          type="button"
          onClick={(e) => {
            // A tiny drag can trigger click on some browsers — ignore if
            // the user actually swiped.
            if (Math.abs(dx) > 5) {
              e.preventDefault();
              return;
            }
            onOpen();
          }}
          className="flex-1 text-start min-w-0"
        >
          <p className="text-[15px] font-bold text-ink leading-snug truncate">{toast.requestType}</p>
          <p className="text-xs text-muted truncate mt-0.5">
            من: {toast.from} · {toast.state}
          </p>
          <p className="text-[11px] text-amber-700/80 mt-1.5 font-medium">
            اسحب جانبًا للإغلاق · اضغط للفتح
          </p>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="w-10 h-10 rounded-lg text-gray-400 flex items-center justify-center shrink-0 active:bg-surface-2"
          aria-label="إغلاق التنبيه"
        >
          <Icon name="x" size={18} />
        </button>
      </div>
    </div>
  );
}
