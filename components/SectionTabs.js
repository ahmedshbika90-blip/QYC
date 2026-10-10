// Section tabs that carry the same red count as the menu item above them:
// if "تسويات المخزون" shows a dot for a free-sample request, the
// "عينات مجانية" tab shows it too.
export default function SectionTabs({ tabs, value, onChange, label = "الأقسام" }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map(([v, l, count]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`relative h-11 px-4 rounded-xl border-2 font-semibold flex items-center gap-2 ${value === v ? "border-accent bg-accent text-on-accent" : "border-line bg-white text-ink"}`}
        >
          {l}
          {count > 0 && (
            <span className="min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-red-600 text-snow text-xs font-bold flex items-center justify-center num" aria-label={`${count} بانتظارك`}>
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
