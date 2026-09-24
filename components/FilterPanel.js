import { useState } from "react";

export default function FilterPanel({ locationQuery, onLocationChange, dateFrom, onDateFromChange, dateTo, onDateToChange, children }) {
  const [open, setOpen] = useState(false);
  const activeCount = [locationQuery, dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-gray-600 bg-white rounded-lg px-3 min-h-[40px] shadow-sm"
      >
        <span>تصفية</span>
        {activeCount > 0 && (
          <span className="bg-gray-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {activeCount}
          </span>
        )}
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="bg-white rounded-lg shadow p-4 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder="ابحث حسب الموقع..."
            className="border rounded-lg px-3 h-11 text-base"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="border rounded-lg px-3 h-11 text-base"
            aria-label="من تاريخ"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="border rounded-lg px-3 h-11 text-base"
            aria-label="إلى تاريخ"
          />
          {children}
        </div>
      )}
    </div>
  );
}
