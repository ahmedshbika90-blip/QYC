import { useState } from "react";
import { STORE_CLASSES } from "../lib/labels";

// Collapsible filter panel shared by invoices and clients. Every field is
// optional — pass only the handlers for the filters a page actually uses
// (e.g. the clients page omits the date range). `children` lets a page add
// its own extra filters (route, document type, etc.) in the same panel.
export default function FilterPanel({
  nameQuery,
  onNameChange,
  locationQuery,
  onLocationChange,
  storeClass,
  onStoreClassChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  extraActiveCount = 0,
  children,
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    [nameQuery, locationQuery, storeClass, dateFrom, dateTo].filter(Boolean).length + extraActiveCount;

  const inputClass = "border rounded-lg px-3 h-11 text-base";

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
        <div className="bg-white rounded-lg shadow p-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {onNameChange && (
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="ابحث حسب اسم العميل..."
              className={inputClass}
            />
          )}
          {onLocationChange && (
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder="ابحث حسب الموقع..."
              className={inputClass}
            />
          )}
          {onStoreClassChange && (
            <select
              value={storeClass}
              onChange={(e) => onStoreClassChange(e.target.value)}
              className={inputClass}
            >
              <option value="">كل التصنيفات</option>
              {STORE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  تصنيف {c}
                </option>
              ))}
            </select>
          )}
          {onDateFromChange && (
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className={inputClass}
              aria-label="من تاريخ"
            />
          )}
          {onDateToChange && (
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className={inputClass}
              aria-label="إلى تاريخ"
            />
          )}
          {children}
        </div>
      )}
    </div>
  );
}
