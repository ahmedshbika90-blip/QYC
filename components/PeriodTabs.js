// Quick period selector for invoice lists: last 7 days (default), 2 weeks,
// or a month. `value` is the selected number of days, or null when a
// custom date range from the filter panel is in use.
const PERIODS = [
  [7, "آخر ٧ أيام"],
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
    <div className="flex gap-1 mb-3">
      {PERIODS.map(([days, label]) => (
        <button
          key={days}
          type="button"
          onClick={() => onChange(days)}
          className={`flex-1 min-h-[40px] px-2 rounded-lg text-sm ${
            value === days ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600 active:bg-gray-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
