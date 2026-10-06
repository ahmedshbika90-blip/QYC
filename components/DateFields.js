// "From" and "To" dates, always side by side — also on a narrow phone, where
// two native date inputs otherwise wrap onto separate lines. Each field
// shrinks to fit its half (min-w-0) instead of pushing the layout wider.
export default function DateFields({ from, to, onFrom, onTo, min, max, className = "", compact = false }) {
  const h = compact ? "h-10" : "h-11";
  const field = `date-field ${h} w-full min-w-0 rounded-xl border border-line bg-white px-2.5 text-sm text-ink`;
  return (
    <div role="group" aria-label="الفترة" className={`grid grid-cols-2 gap-2 min-w-0 ${className}`}>
      <label className="flex flex-col gap-1 min-w-0 text-xs font-semibold text-muted">
        من
        <input type="date" value={from || ""} min={min} max={to || max} onChange={(e) => onFrom(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 min-w-0 text-xs font-semibold text-muted">
        إلى
        <input type="date" value={to || ""} min={from || min} max={max} onChange={(e) => onTo(e.target.value)} className={field} />
      </label>
    </div>
  );
}
