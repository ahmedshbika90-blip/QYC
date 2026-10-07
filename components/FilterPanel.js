import { useState } from "react";
import { STORE_CLASSES } from "../lib/labels";
import Icon from "./Icon";
import DateFields from "./DateFields";
import FilterChips from "./FilterChips";

// Collapsible filter panel shared by invoices and clients. Every field is
// optional — pass only the handlers for the filters a page actually uses
// (e.g. the clients page omits the date range). `children` lets a page add
// its own extra filters (route, document type, etc.) in the same panel.
export default function FilterPanel({
  nameQuery,
  onNameChange,
  deliveryRoute = "",
  onDeliveryRouteChange,
  deliveryRouteOptions = [],
  locationQuery,
  onLocationChange,
  storeClass,
  onStoreClassChange,
  discountFilter,
  sampleFilter = "",
  onSampleFilterChange,
  priceFilter = "",
  onPriceFilterChange,
  onDiscountFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  extraActiveCount = 0,
  children,
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    [nameQuery, deliveryRoute, locationQuery, storeClass, discountFilter, sampleFilter, priceFilter, dateFrom, dateTo].filter(Boolean).length + extraActiveCount;

  const inputClass = "border rounded-lg px-3 h-11 text-base";

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-sm text-ink bg-white rounded-xl px-3.5 h-11 shadow-sm"
      >
        <Icon name="filter" size={17} className="text-muted" />
        <span className="font-medium">بحث وتصفية</span>
        {activeCount > 0 && (
          <span className="bg-accent text-on-accent text-xs rounded-full w-5 h-5 flex items-center justify-center num">
            {activeCount}
          </span>
        )}
        <Icon name="chevronDown" size={16} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="bg-white rounded-2xl shadow p-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {onNameChange && (
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="ابحث حسب اسم العميل..."
              className={inputClass}
            />
          )}
          {onDeliveryRouteChange && deliveryRouteOptions.length > 0 && (
            <select
              value={deliveryRoute}
              onChange={(e) => onDeliveryRouteChange(e.target.value)}
              className={`${inputClass} bg-white`}
              aria-label="المسار"
            >
              <option value="">المسار: الكل</option>
              {deliveryRouteOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
            <FilterChips
              label="تصنيف المتجر"
              value={storeClass}
              onChange={onStoreClassChange}
              options={STORE_CLASSES.map((c) => [c, `تصنيف ${c}`])}
            />
          )}
          {onDiscountFilterChange && (
            <FilterChips
              label="الخصم"
              value={discountFilter}
              onChange={onDiscountFilterChange}
              options={[
                ["with", "فيها خصم"],
                ["without", "بدون خصم"],
              ]}
            />
          )}
          {onDateFromChange && onDateToChange && (
            <DateFields className="sm:col-span-2" from={dateFrom} to={dateTo} onFrom={onDateFromChange} onTo={onDateToChange} />
          )}
          {onSampleFilterChange && (
            <select
              value={sampleFilter}
              onChange={(e) => onSampleFilterChange(e.target.value)}
              className={inputClass}
              aria-label="العينة المجانية"
            >
              <option value="">العينة المجانية: الكل</option>
              <option value="with">بها عينة مجانية</option>
              <option value="without">بدون عينة مجانية</option>
            </select>
          )}
          {onPriceFilterChange && (
            <select
              value={priceFilter}
              onChange={(e) => onPriceFilterChange(e.target.value)}
              className={inputClass}
              aria-label="السعر المعدّل"
            >
              <option value="">السعر المعدّل: الكل</option>
              <option value="with">بها سعر معدّل</option>
              <option value="without">بدون سعر معدّل</option>
            </select>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
