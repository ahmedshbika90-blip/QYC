import { useState } from "react";
import Icon from "./Icon";
import { formatNumber } from "../lib/labels";
import { parseDecimal } from "../lib/qty";
import NumericInput from "./NumericInput";

// The money block at the bottom of an invoice — the same on the new-invoice
// form, the edit form and the invoice page. Kept quiet on purpose:
//
//   no discount:      الإجمالي                 150,000 SDG
//                     + إضافة خصم
//
//   with a discount:  المجموع                  150,000 SDG
//                     الخصم       [ 10,000 ]  ✕
//                     ─────────────────────────────
//                     الإجمالي                 140,000 SDG
//
// The discount is an amount in SDG (not %), typed with thousands
// separators as you go. Read-only when there's no `onDiscountChange`.
export default function InvoiceTotals({ subtotal, discount, onDiscountChange, className = "" }) {
  const d = Number(parseDecimal(discount)) || 0;
  const [open, setOpen] = useState(d > 0);
  const editable = Boolean(onDiscountChange);
  const showDiscount = editable ? open || d > 0 : d > 0;
  const over = d > subtotal;
  const total = Math.max(0, Math.round((subtotal - d) * 100) / 100);

  function removeDiscount() {
    setOpen(false);
    onDiscountChange("");
  }

  return (
    <div className={`rounded-2xl border border-line bg-white overflow-hidden ${className}`}>
      {showDiscount && (
        <div className="px-4 pt-3.5 pb-3 space-y-2.5 text-[0.9375rem] bg-surface-2/60">
          <Row label="المجموع" value={formatNumber(subtotal)} />
          {editable ? (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="invoice-discount" className="text-ink-soft">الخصم</label>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-700 font-bold">−</span>
                <NumericInput
                  id="invoice-discount"
                  decimal
                  value={discount ?? ""}
                  onChange={onDiscountChange}
                  placeholder="0"
                  autoFocus={open && d === 0}
                  aria-invalid={over}
                  className={`w-32 h-10 border rounded-xl px-3 text-base text-end bg-white ${over ? "border-red-400 text-red-600" : "border-line"}`}
                />
                <button type="button" onClick={removeDiscount} aria-label="إزالة الخصم" title="إزالة الخصم" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-white">
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>
          ) : (
            <Row label="الخصم" value={`− ${formatNumber(d)}`} tone="discount" />
          )}
          {over && <p className="text-xs text-red-600">الخصم أكبر من مجموع الفاتورة.</p>}
        </div>
      )}
      <div className={`px-4 py-3.5 flex items-center justify-between gap-3 ${showDiscount ? "border-t border-line" : ""}`}>
        <span className="font-bold text-ink">الإجمالي</span>
        <span dir="ltr" className="num tabular-ltr text-xl font-bold text-ink">{formatNumber(total)}</span>
      </div>
      {editable && !showDiscount && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-t border-line h-11 text-sm font-semibold text-accent-ink flex items-center justify-center gap-1.5 hover:bg-surface-2"
        >
          <Icon name="plus" size={16} />
          إضافة خصم
        </button>
      )}
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-soft">{label}</span>
      <span dir="ltr" className={`num tabular-ltr ${tone === "discount" ? "font-semibold text-amber-700" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
