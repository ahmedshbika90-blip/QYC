import { useEffect, useState } from "react";
import { parseDecimal, roundQty } from "../lib/qty";

// Large +/- buttons instead of a tiny number field — much easier to tap
// accurately on a phone or tablet than typing into a narrow input.
//
// Quantities may be fractional (2.5, 0.25 …). The field keeps its own
// text while the person is typing, so an in-progress "2." or "0.0" isn't
// snapped back to a whole number mid-keystroke; it's parsed (Arabic digits
// and "٫" accepted), rounded to 2 decimals and clamped to [min, max] as it
// goes, and tidied on blur. +/- still step by one whole unit.
export default function QtyStepper({ value, onChange, min = 0, max }) {
  const qty = Number(value) || 0;
  const [draft, setDraft] = useState(String(qty));

  // Follow outside changes (+/- buttons, a cap applied by the parent)
  // without clobbering what's being typed when it already means the same.
  useEffect(() => {
    const typed = parseDecimal(draft);
    if (!Number.isFinite(typed) || roundQty(typed) !== qty) {
      // An in-progress "0." / "0.0" stays as typed until it means something.
      if (qty === 0 && /^[0٠۰]*[.,٫]?[0٠۰]*$/.test(draft.trim())) return;
      setDraft(String(qty));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  const clamp = (n) => {
    let next = Math.max(min, roundQty(n));
    if (max !== undefined) next = Math.min(max, next);
    return next;
  };

  function dec() {
    onChange(clamp(qty - 1));
  }
  function inc() {
    onChange(clamp(qty + 1));
  }

  // A zero is never sent while typing: "0" is usually the start of "0.5",
  // and several parents drop a line from the cart the moment its quantity
  // hits 0. Zero/empty is only committed when the field is left.
  function onType(e) {
    const text = e.target.value;
    setDraft(text);
    const n = parseDecimal(text);
    if (Number.isFinite(n) && roundQty(n) > 0) onChange(clamp(n));
  }

  function onBlur() {
    const n = parseDecimal(draft);
    const committed = Number.isFinite(n) ? clamp(n) : clamp(0);
    if (committed !== qty) onChange(committed);
    setDraft(String(committed));
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={dec}
        className="w-11 h-11 flex items-center justify-center text-xl rounded-lg bg-gray-100 text-gray-700 active:bg-gray-200 select-none"
        aria-label="إنقاص الكمية"
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        dir="ltr"
        value={draft}
        onChange={onType}
        onBlur={onBlur}
        onFocus={(e) => e.target.select()}
        aria-label="الكمية"
        className="w-16 h-11 text-center border rounded-lg text-base tabular-ltr"
      />
      <button
        type="button"
        onClick={inc}
        className="w-11 h-11 flex items-center justify-center text-xl rounded-lg bg-gray-100 text-gray-700 active:bg-gray-200 select-none"
        aria-label="زيادة الكمية"
      >
        +
      </button>
    </div>
  );
}
