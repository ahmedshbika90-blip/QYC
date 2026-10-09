import { STATUS_LABELS } from "../lib/labels";

const TABS = ["active", "refunded", "cancelled"];

// Segmented control — one track, the selected segment lifts out of it.
export default function StatusTabs({ value, onChange, counts }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-surface-2 max-w-full">
      {TABS.map((tab) => {
        const on = value === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab)}
            className={`flex items-center gap-1.5 whitespace-nowrap h-10 px-4 rounded-lg text-sm ${
              on ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"
            }`}
          >
            {STATUS_LABELS[tab]}
            {counts?.[tab] !== undefined && (
              <span className={`num text-xs ${on ? "text-muted" : "text-gray-400"}`}>{counts[tab]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
