import { useRouter } from "next/router";
import Icon from "./Icon";

// Back control for inner screens. Uses real history when the user came
// from inside the app, otherwise falls back to `href` (or the role home)
// so a deep link — e.g. opening a document straight from a notification —
// never dead-ends.
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
      className={`inline-flex items-center gap-1.5 h-11 -ms-2 px-2 rounded-xl text-sm font-medium text-ink-soft hover:bg-surface-2 active:bg-surface-2 ${className}`}
    >
      {/* RTL: "back" points right. */}
      <Icon name="chevronRight" size={20} />
      {label}
    </button>
  );
}
