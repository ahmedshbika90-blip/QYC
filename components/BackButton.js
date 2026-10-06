import { useRouter } from "next/router";
import Icon from "./Icon";

// Back control for inner screens — big and unmistakable on a phone AND on
// a desktop: a real button shape (filled, bordered, 48px tall, full label)
// instead of a small grey chevron that read as decoration.
//
// Uses real history when the user came from inside the app, otherwise
// falls back to `href` (or the role home) so a deep link — e.g. opening a
// document straight from a notification — never dead-ends.
export default function BackButton({ href, label = "رجوع", className = "" }) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(href || "/");
  }

  // Sticky just under the top bar: it scrolls with the page until it
  // reaches the top, then stays there — so "back" is one tap away from any
  // point of a long page, without a fixed bar covering content.
  return (
    <div className={`sticky top-[4.5rem] z-[15] mb-4 self-start pointer-events-none ${className}`}>
      <button
        type="button"
        onClick={goBack}
        aria-label={label}
        className="back-button pointer-events-auto inline-flex items-center gap-2 h-12 ps-3 pe-5 rounded-2xl bg-white/95 backdrop-blur border-2 border-line text-ink text-base font-bold shadow-md hover:border-accent hover:text-accent-ink active:bg-surface-2 transition-colors"
      >
        {/* Points toward where the reader came from: right in Arabic, left in English. */}
        <span className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center">
          <Icon name="chevronRight" size={22} strokeWidth={2.6} className="rtl-flip" />
        </span>
        {label}
      </button>
    </div>
  );
}
