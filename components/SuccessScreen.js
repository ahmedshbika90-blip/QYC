import { useEffect, useRef } from "react";
import Link from "next/link";
import Icon from "./Icon";

// The ONE success view for every "it worked" moment in the app — a client
// registered, an invoice saved, a shipping order sent, a request accepted
// or cancelled. It REPLACES the form on the same page (no new tab, no
// toast, no leftover fields underneath), so the person sees exactly one
// thing: what happened, the number they need, and the two obvious next
// steps.
//
//   title      what happened              "تم تسجيل العميل"
//   number     the reference to hand on   1001   (optional)
//   hint       one line of guidance       "أعطِ هذا الرقم للعميل…"  (optional)
//   primary    the "do another" action    { label, onClick } or { label, href }
//   secondary  the "go to the list" one   { label, href } or { label, onClick }
//   tone       "success" (default) | "warn" (e.g. saved offline, sent for approval)
//
// In RTL the secondary action sits on the right and the primary (filled)
// one on the left, matching the reference screen.
export default function SuccessScreen({ title, number, hint, primary, secondary, tone = "success", children }) {
  const headingRef = useRef(null);

  // Move focus to the result so screen readers announce it and keyboard
  // users aren't left on a button that no longer exists.
  useEffect(() => {
    headingRef.current?.focus();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const warn = tone === "warn";

  return (
    <section
      role="status"
      aria-live="polite"
      className="success-screen bg-white border border-line rounded-3xl shadow px-5 py-7 sm:px-8 text-center"
    >
      <span
        className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
          warn ? "bg-amber-100 text-amber-700" : "bg-accent-soft text-accent-ink"
        }`}
      >
        <Icon name={warn ? "alert" : "check"} size={30} strokeWidth={2.8} />
      </span>

      <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg font-bold text-ink outline-none">
        {title}
      </h2>

      {number !== undefined && number !== null && number !== "" && (
        <p className="num tabular-ltr text-5xl sm:text-6xl font-bold text-ink tracking-wider my-3" dir="ltr">
          {number}
        </p>
      )}

      {hint && <p className="text-sm text-muted mt-2 max-w-sm mx-auto leading-relaxed">{hint}</p>}

      {children && <div className="mt-4 text-start">{children}</div>}

      {(primary || secondary) && (
        <div className={`grid gap-3 mt-6 ${primary && secondary ? "grid-cols-2" : "grid-cols-1"}`}>
          {secondary && <Action {...secondary} variant="secondary" />}
          {primary && <Action {...primary} variant="primary" />}
        </div>
      )}
    </section>
  );
}

function Action({ label, href, onClick, variant }) {
  const cls = `h-14 rounded-2xl text-[0.9375rem] font-bold flex items-center justify-center px-3 transition-colors ${
    variant === "primary"
      ? "bg-accent text-on-accent active:bg-accent-strong hover:bg-accent-strong"
      : "bg-surface-2 text-ink active:bg-gray-200 hover:bg-gray-200"
  }`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  );
}
