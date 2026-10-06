import { useState } from "react";
import Icon from "./Icon";
import { formatNumber } from "../lib/labels";
import { cleanMoneyInput, money2, parseDecimal } from "../lib/qty";

// The money block at the bottom of an invoice — the same on the new-invoice
// form, the edit form and the invoice page:
//
//   المجموع          150,000.00 SDG
//   خصم الفاتورة     − 10,000.00 SDG     ← an amount, typed in SDG, not %
//   الإجمالي         140,000.00 SDG
//
// With `onDiscountChange` the discount is editable — but hidden behind an
// "إضافة خصم" checkbox, so the invoice stays quiet unless there is one.
// Ticking it shows the amount box (Arabic digits are accepted and turned
// into English ones); unticking it clears the discount. An invoice that
// already has a discount (editing) opens with the box ticked.
// Without `onDiscountChange` it's read-only and the discount row only
// appears when there is one.
export default function InvoiceTotals({ subtotal, discount, onDiscountChange, className = "" }) {
  const d = Number(parseDecimal(discount)) || 0;
  const [discountOn, setDiscountOn] = useState(d > 0);
  const showDiscount = discountOn || d > 0;

  function toggleDiscount(e) {
    const on = e.target.checked;
    setDiscountOn(on);
    if (!on) onDiscountChange("");
  }

  const over = d > subtotal;
  const total = Math.max(0, Math.round((subtotal - d) * 100) / 100);

  return (
    <div className={`rounded-2xl bg-surface-2 p-4 space-y-2.5 text-[15px] ${className}`}>
      <Row label="المجموع" value={formatNumber(subtotal)} />
      {onDiscountChange ? (
        <>
          <label
            className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl border cursor-pointer select-none focus-within:ring-2 focus-within:ring-accent/40 ${
              showDiscount ? "bg-accent-soft border-accent text-accent-ink" : "bg-white border-line text-ink-soft"
            }`}
          >
            <input type="checkbox" checked={showDiscount} onChange={toggleDiscount} className="sr-only" />
            <span
              aria-hidden="true"
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                showDiscount ? "bg-accent border-accent text-on-accent" : "bg-white border-gray-300"
              }`}
            >
              {showDiscount && <Icon name="check" size={16} strokeWidth={3.2} />}
            </span>
            <span className="text-sm font-semibold">إضافة خصم على الفاتورة</span>
          </label>
          {showDiscount && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="invoice-discount" className="text-ink-soft">
                خصم الفاتورة <span className="text-xs text-muted">(مبلغ)</span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-muted">−</span>
                <input
                  id="invoice-discount"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={discount ?? ""}
                  onChange={(e) => onDiscountChange(cleanMoneyInput(e.target.value))}
                  onBlur={(e) => onDiscountChange(money2(e.target.value))}
                  placeholder="0.00"
                  autoFocus={discountOn && d === 0}
                  aria-invalid={over}
                  className={`w-36 h-11 border rounded-xl px-3 text-base tabular-ltr text-end bg-white ${
                    over ? "border-red-400 text-red-600" : "border-line"
                  }`}
                />
                <span className="text-xs text-muted">SDG</span>
              </div>
            </div>
          )}
        </>
      ) : (
        d > 0 && <Row label="خصم الفاتورة" value={`− ${formatNumber(d)}`} tone="discount" />
      )}
      {over && <p className="text-xs text-red-600">الخصم أكبر من مجموع الفاتورة.</p>}
      <div className="border-t border-line pt-2.5">
        <Row label="الإجمالي" value={formatNumber(total)} strong />
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-bold text-ink" : "text-ink-soft"}>{label}</span>
      <span
        dir="ltr"
        className={`num tabular-ltr ${strong ? "text-lg font-bold text-ink" : tone === "discount" ? "font-semibold text-amber-700" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
