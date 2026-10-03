import Icon from "./Icon";

// The free-sample control on an invoice line. Deliberately large and
// self-explanatory: a real checkbox (keyboard + screen-reader friendly)
// drawn as a labelled button, with a gift icon and a visible ON state, so
// nobody ticks it by accident or misses that a line is free.
export default function FreeSampleToggle({ checked, onChange }) {
  return (
    <label
      className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl border cursor-pointer select-none focus-within:ring-2 focus-within:ring-accent/40 ${
        checked
          ? "bg-accent-soft border-accent text-accent-ink"
          : "bg-white border-line text-ink-soft hover:bg-surface-2"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
          checked ? "bg-accent border-accent text-on-accent" : "bg-white border-gray-300"
        }`}
      >
        {checked && <Icon name="check" size={16} strokeWidth={3.2} />}
      </span>
      <Icon name="gift" size={18} />
      <span className="text-sm font-semibold">عينة مجانية</span>
      {checked && <span className="text-xs opacity-80">— بدون مقابل</span>}
    </label>
  );
}
