import { STATUS_LABELS } from "../lib/labels";

const TABS = ["active", "cancelled"];
const TAB_LABELS = STATUS_LABELS;

export default function StatusTabs({ value, onChange, counts }) {
  return (
    <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`flex items-center gap-1.5 whitespace-nowrap min-h-[40px] px-3 rounded-lg text-sm ${
            value === tab
              ? "bg-gray-900 text-white font-medium"
              : "text-gray-600 bg-white active:bg-gray-100"
          }`}
        >
          {TAB_LABELS[tab]}
          {counts?.[tab] !== undefined && (
            <span className={value === tab ? "text-gray-300" : "text-gray-400"}>
              ({counts[tab]})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
