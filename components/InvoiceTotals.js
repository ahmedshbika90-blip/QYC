import { formatNumber } from "../lib/labels";
import { parseDecimal } from "../lib/qty";

// The money block at the bottom of an invoice — the same on the new-invoice
// form, the edit form and the invoice page:
//
//   المجموع          150,000.00 SDG
//   خصم الفاتورة     − 10,000.00 SDG     ← an amount, typed in SDG, not %
//   الإجمالي         140,000.00 SDG
//
// With `onDiscountChange` the discount is an input (Arabic digits are
// accepted and turned into English ones); without it, it's read-only and
// the discount row only appears when there is one.
export default function InvoiceTotals({ subtotal, discount, onDiscountChange, className = "" }) {
  const d = Number(parseDecimal(discount)) || 0;
  const over = d > subtotal;
  const total = Math.max(0, Math.round((subtotal - d) * 100) / 100);

  return (
    <div className={`rounded-2xl bg-surface-2 p-4 space-y-2.5 text-[15px] ${className}`}>
      <Row label="المجموع" value={formatNumber(subtotal)} />
      {onDiscountChange ? (
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
              onChange={(e) => {
                const raw = e.target.value
                  .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
                  .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
                  .replace(/[٫,]/g, ".")
                  .replace(/[^\d.]/g, "");
                onDiscountChange(raw);
              }}
              placeholder="0"
              aria-invalid={over}
              className={`w-36 h-11 border rounded-xl px-3 text-base tabular-ltr text-end bg-white ${
                over ? "border-red-400 text-red-600" : "border-line"
              }`}
            />
            <span className="text-xs text-muted">SDG</span>
          </div>
        </div>
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
