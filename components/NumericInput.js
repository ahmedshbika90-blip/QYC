import { useLayoutEffect, useRef } from "react";
import { cleanMoneyInput, cleanQtyInput } from "../lib/qty";
import { groupDigits, caretAfterFormat, countDigits } from "../lib/numberFormat";

// A number field that shows thousands separators AS YOU TYPE (100,000).
// `value` / `onChange` work with the plain number string ("100000"), so the
// rest of the app is unchanged. Arabic digits are accepted. Whole numbers
// only unless `decimal` is set.
export default function NumericInput({ value, onChange, decimal = false, className = "", inputRef, onKeyDown, enterSubmits = false, ...props }) {
  const own = useRef(null);
  const ref = inputRef || own;
  const caret = useRef(null);
  const shown = groupDigits(value);

  useLayoutEffect(() => {
    if (caret.current == null || !ref.current || document.activeElement !== ref.current) return;
    const pos = caretAfterFormat(shown, caret.current);
    ref.current.setSelectionRange(pos, pos);
    caret.current = null;
  });

  function handle(e) {
    const el = e.target;
    const before = countDigits(el.value.slice(0, el.selectionStart ?? el.value.length).replace(/,/g, ""));
    // Our own "," separators are dropped first ("," would otherwise be read
    // as a decimal comma by cleanMoneyInput).
    const text = el.value.replace(/,/g, "");
    const raw = decimal ? cleanMoneyInput(text) : cleanQtyInput(text);
    caret.current = before;
    onChange(raw);
  }

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      dir="ltr"
      autoComplete="off"
      value={shown}
      onChange={handle}
      onKeyDown={(e) => {
        // "Done"/Enter on a phone keyboard just closes the field.
        if (e.key === "Enter" && !enterSubmits) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
      enterKeyHint={props.enterKeyHint || "done"}
      className={`num ${className}`}
    />
  );
}
