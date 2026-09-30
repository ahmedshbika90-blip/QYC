import Link from "next/link";
import Icon from "./Icon";

// The day's main actions. The first is the primary (accent) — the one
// thing this person does most — the rest are quieter secondary buttons,
// so there is always one obvious next step instead of a wall of equals.
export default function QuickActions({ actions }) {
  const cols = actions.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : actions.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`grid ${cols} gap-2.5 mb-5`}>
      {actions.map((a, i) => {
        const primary = a.variant ? a.variant === "primary" : i === 0;
        return (
          <Link
            key={a.href}
            href={a.href}
            className={`flex items-center justify-center gap-2 rounded-2xl h-14 px-3 text-[15px] font-semibold text-center leading-tight ${
              primary
                ? "bg-accent text-on-accent shadow-sm active:bg-accent-strong"
                : "bg-white text-ink shadow active:bg-surface-2"
            }`}
          >
            {a.icon && <Icon name={a.icon} size={19} strokeWidth={primary ? 2.4 : 2} />}
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
