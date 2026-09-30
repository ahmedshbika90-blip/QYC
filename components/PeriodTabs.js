// Quick period selector for invoice lists: last 7 days (default), 2 weeks,
// or a month. `value` is the selected number of days, or null when a
// custom date range from the filter panel is in use.
const PERIODS = [
  [7, "آخر 7 أيام"],
  [14, "أسبوعان"],
  [30, "شهر"],
];

// Local midnight at the start of the period, including today — e.g. 7 days
// = today plus the 6 days before it. Stable for the whole day, so repeat
// loads hit the cache instead of building a new query each time.
export function periodStartISO(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

export default function PeriodTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="الفترة" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 mb-3">
      {PERIODS.map(([days, label]) => {
        const on = value === days;
        return (
          <button
            key={days}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(days)}
            className={`h-10 px-2 rounded-lg text-sm ${on ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
