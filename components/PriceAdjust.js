import Icon from "./Icon";
import { formatNumber } from "../lib/labels";
import { cleanMoneyInput } from "../lib/qty";
import { cartLineTotal, priceProblem, REASON_MAX } from "../lib/linePrice";

// "تعديل السعر" on one invoice line: sell this product ABOVE its list
// price on this invoice only, with a required reason. The catalog price
// doesn't change. Closed by default so the cart stays quiet; ticking it
// shows the new-price and reason boxes, unticking it goes back to the
// list price. Hidden on a free-sample line (a free line has no price).
//
// Renders as siblings (toggle + panel) so it can sit in a flex-wrap row
// next to other line toggles; the panel takes a full row of its own.
//
// `line` is a cart line (lib/linePrice.js); `onChange(patch)` merges
// fields into it.
export default function PriceAdjust({ line, onChange }) {
  if (line.freeSample || line.listPrice == null) return null;
  const on = Boolean(line.priceAdjusted);
  const problem = priceProblem(line);

  return (
    <>
      <label
        className={`inline-flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl border cursor-pointer select-none focus-within:ring-2 focus-within:ring-accent/40 ${
          on ? "bg-amber-50 border-amber-400 text-amber-800" : "bg-white border-line text-ink-soft hover:bg-surface-2"
        }`}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(e.target.checked ? { priceAdjusted: true } : { priceAdjusted: false, customPrice: "", priceReason: "" })
          }
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
            on ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-gray-300"
          }`}
        >
          {on && <Icon name="check" size={16} strokeWidth={3.2} />}
        </span>
        <Icon name="tag" size={18} />
        <span className="text-sm font-semibold">تعديل السعر</span>
      </label>

      {on && (
        <div className="w-full basis-full rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-soft">
              سعر القائمة <span className="num tabular-ltr">{formatNumber(line.listPrice)}</span> ← السعر الجديد
            </span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={line.customPrice}
              onChange={(e) => onChange({ customPrice: cleanMoneyInput(e.target.value) })}
              placeholder={String(line.listPrice)}
              aria-label="السعر الجديد للوحدة"
              autoFocus={!line.customPrice}
              className="w-32 h-11 border border-amber-300 rounded-xl px-3 text-base tabular-ltr text-end bg-white"
            />
            <span className="text-xs text-muted">/ {line.unit}</span>
          </div>
          <input
            type="text"
            value={line.priceReason}
            onChange={(e) => onChange({ priceReason: e.target.value.slice(0, REASON_MAX) })}
            placeholder="سبب تعديل السعر (مطلوب)"
            aria-label="سبب تعديل السعر"
            className="w-full h-11 border border-amber-300 rounded-xl px-3 text-base bg-white"
          />
          {problem ? (
            <p className="text-xs text-red-600">{problem}</p>
          ) : (
            <p className="text-xs text-amber-800">
              إجمالي السطر: <span className="num tabular-ltr font-semibold">{formatNumber(cartLineTotal(line))}</span>
              {" — "}زيادة <span className="num tabular-ltr">{formatNumber(cartLineTotal(line) - line.listPrice * line.qty)}</span> على سعر القائمة
            </p>
          )}
        </div>
      )}
    </>
  );
}
