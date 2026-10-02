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

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className={`back-button inline-flex items-center gap-2 h-12 ps-3 pe-5 mb-4 rounded-2xl bg-white border-2 border-line text-ink text-base font-bold shadow-sm hover:border-accent hover:text-accent-ink active:bg-surface-2 transition-colors ${className}`}
    >
      {/* RTL: "back" points right, toward where the reader came from. */}
      <span className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center">
        <Icon name="chevronRight" size={22} strokeWidth={2.6} />
      </span>
      {label}
    </button>
  );
}
