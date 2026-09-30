import Link from "next/link";
import Icon from "./Icon";

// Building blocks for every role's home screen. The home screen answers
// three questions, in this order: what day is it and how is it going
// (TodayHeader), what is waiting on ME (ActionInbox), and what do I do
// next (QuickActions, from ./QuickActions).

function todayLabel() {
  return new Date().toLocaleDateString("ar-EG", {
    calendar: "gregory",
    numberingSystem: "latn",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function TodayHeader({ title, subtitle, stats = [], aside }) {
  return (
    <section className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{todayLabel()}</p>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink mt-0.5">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {stats.length > 0 && (
        <div className={`grid gap-2.5 mt-4 ${stats.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl shadow px-4 py-3">
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`num text-2xl font-bold mt-1 tabular-ltr text-start ${s.tone === "warn" ? "text-amber-700" : "text-ink"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const TONES = {
  warn: "bg-amber-100 text-amber-700",
  accent: "bg-accent-soft text-accent-ink",
  info: "bg-blue-100 text-blue-700",
  danger: "bg-red-100 text-red-600",
};

// Everything waiting on this person, ranked, in one list — replaces the
// scattered amber banners. Each row says what it is, why it matters and
// offers the one action that clears it. Renders a calm "all clear" state
// when empty so the absence of work is itself reassuring information.
export function ActionInbox({ items, title = "بانتظارك", emptyText, loading }) {
  const count = items.length;
  return (
    <section aria-label={title} className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {count > 0 && (
          <span className="num min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow h-[68px] animate-pulse" />
      ) : count === 0 ? (
        <div className="bg-white rounded-2xl shadow px-4 py-3.5 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center">
            <Icon name="check" size={20} strokeWidth={2.6} />
          </span>
          <p className="text-sm text-ink-soft">{emptyText || "لا شيء بانتظارك الآن"}</p>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
          {items.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="flex items-center gap-3 px-3.5 py-3 min-h-[68px] active:bg-surface-2">
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TONES[it.tone || "warn"]}`}>
                  <Icon name={it.icon || "bell"} size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink leading-snug line-clamp-2">{it.title}</span>
                  {it.meta && <span className="block text-xs text-muted truncate mt-0.5">{it.meta}</span>}
                </span>
                {it.cta ? (
                  <span className={`shrink-0 h-8 px-3 rounded-lg text-[13px] font-bold flex items-center ${TONES[it.tone || "warn"]}`}>
                    {it.cta}
                  </span>
                ) : (
                  <Icon name="chevronLeft" size={18} className="text-gray-400" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-base font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

// Today's invoices for the header stats — computed from what the page
// already loaded, so it costs no extra request.
export function todayStats(orders) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todays = orders.filter((o) => o.status !== "cancelled" && o.createdAt && new Date(o.createdAt) >= start);
  const total = todays.reduce((s, o) => s + (Number(o.total) || 0), 0);
  return { count: todays.length, total };
}
