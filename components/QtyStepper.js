import { useEffect, useState } from "react";
import { cleanQtyInput, parseQty } from "../lib/qty";

// The quantity box on every cart line (invoices, loading requests,
// receiving, damaged goods). Typed only — no +/− buttons — and large
// enough to read and tap easily on a phone.
//
// Whole numbers only: Arabic digits are turned into English ones as they
// are typed, and anything that isn't a digit (".", "٫", ",") is dropped,
// so a fraction can't be entered at all. Kept capped at [min, max].
export default function QtyStepper({ value, onChange, min = 0, max }) {
  const qty = Number(value) || 0;
  const [draft, setDraft] = useState(String(qty));

  // Follow outside changes (a cap applied by the parent) without
  // clobbering what is being typed when it already means the same.
  useEffect(() => {
    const typed = parseQty(draft);
    if (draft !== "" && typed !== qty) setDraft(String(qty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  const clamp = (n) => {
    let next = Math.max(min, n);
    if (max !== undefined) next = Math.min(Math.floor(max), next);
    return next;
  };

  // A zero is never sent while typing: several parents drop a line from
  // the cart the moment its quantity hits 0, which would remove it while
  // the box is being cleared to type a new number. Zero/empty is only
  // committed when the field is left.
  function onType(e) {
    const text = cleanQtyInput(e.target.value);
    setDraft(text);
    const n = parseQty(text);
    if (Number.isInteger(n) && n > 0) {
      const capped = clamp(n);
      if (capped !== n) setDraft(String(capped));
      onChange(capped);
    }
  }

  function onBlur() {
    const n = parseQty(draft);
    const committed = Number.isInteger(n) ? clamp(n) : clamp(0);
    if (committed !== qty) onChange(committed);
    setDraft(String(committed));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      dir="ltr"
      value={draft}
      onChange={onType}
      onBlur={onBlur}
      onFocus={(e) => e.target.select()}
      aria-label="الكمية"
      className="w-28 h-14 shrink-0 text-center border-2 border-gray-300 rounded-xl text-xl font-semibold tabular-ltr bg-white focus:border-accent focus:outline-none"
    />
  );
}
