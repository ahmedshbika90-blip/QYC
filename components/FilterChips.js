// A filter row with no "الكل / كل الأنواع" option: tap an option to filter
// by it, tap the SAME option again to turn the filter off. "Nothing
// selected" simply means "everything". The selected option shows a small ✕
// so it's obvious a second tap clears it.
//
//   <FilterChips label="المسار" value={route} onChange={setRoute}
//     options={[["car1", "مبيعات جملة"], ["car2", "مبيعات تجزئة"]]} />
export default function FilterChips({ label, value, onChange, options, className = "" }) {
  return (
    <div className={`sm:col-span-2 ${className}`} role="group" aria-label={label}>
      {label && <p className="text-xs font-semibold text-muted mb-1.5">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? "" : v)}
              title={on ? "اضغط مرة أخرى لإلغاء الفلتر" : undefined}
              className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm border transition-colors ${
                on
                  ? "bg-accent text-on-accent border-accent font-semibold"
                  : "bg-white text-ink-soft border-line hover:border-gray-400"
              }`}
            >
              {text}
              {on && (
                <span aria-hidden="true" className="text-xs opacity-80">
                  ✕
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
