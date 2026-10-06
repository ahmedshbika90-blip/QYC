import { useEffect } from "react";
import Icon from "./Icon";

// Confirmation that an action actually worked. Appears centred above the
// tab bar, auto-dismisses, and announces itself to screen readers.
// Pass `action` for a follow-up ("عرض العميل") when there's an obvious
// next step.
export default function SuccessToast({ message, action, onDone, duration = 3200 }) {
  useEffect(() => {
    if (!message || !onDone) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, onDone, duration]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="success-toast fixed inset-x-0 z-40 mx-auto w-fit max-w-[calc(100%-1.5rem)] flex items-center gap-2.5 rounded-2xl bg-green-100 text-green-800 border border-green-200 px-4 py-3 shadow-lg"
    >
      <span className="w-7 h-7 rounded-full bg-solid-green text-snow flex items-center justify-center shrink-0">
        <Icon name="check" size={17} strokeWidth={3} />
      </span>
      <span className="text-sm font-semibold">{message}</span>
      {action}
      {onDone && (
        <button type="button" onClick={onDone} aria-label="إغلاق" className="w-8 h-8 rounded-lg flex items-center justify-center text-green-800/70 hover:bg-green-200">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
