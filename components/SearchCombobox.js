import { useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { normalizeAr, findSame } from "../lib/arabicSearch";

// A text box that searches a list as you type and shows the matches right
// under it (big rows, easy to tap). Pick one, or keep typing: a name that
// isn't in the list is simply used as a NEW one. Same large layout as the
// invoice form. Used for الموقع (and anywhere a "pick or add" list fits).
//
//   options    names already in use
//   preferred  names to list first (e.g. locations on the chosen route)
//   newHint    (name) => text shown when the typed name is new
export default function SearchCombobox({ id, label, value, onChange, options, preferred = [], placeholder, newHint, required, maxLength = 60 }) {
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const closeTimer = useRef(null);

  const matches = useMemo(() => {
    const q = normalizeAr(value);
    const pref = new Set(preferred);
    const all = [...new Set(options)].filter((o) => !q || normalizeAr(o).includes(q));
    // Starts-with first, then "on this route", then A→Z.
    const rank = (o) => (q && normalizeAr(o).startsWith(q) ? 0 : 1) * 2 + (pref.has(o) ? 0 : 1);
    return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ar")).slice(0, 8);
  }, [value, options, preferred]);

  const same = findSame(options, value);
  const isNew = Boolean(value.trim()) && !same;

  function pick(o) {
    onChange(o);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      {label && (
        <label htmlFor={inputId} className="block text-sm text-gray-600 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="next"
          value={value}
          maxLength={maxLength}
          required={required}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            clearTimeout(closeTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            // Same name typed with different spelling → keep the saved spelling.
            if (same && same !== value) onChange(same);
            closeTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (!open || !matches.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(matches.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(matches[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="w-full border rounded-lg ps-10 pe-3 h-12 text-base"
        />
        <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted pointer-events-none" />
      </div>
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" className="mt-1 bg-white border border-line rounded-xl shadow-lg divide-y divide-line overflow-hidden max-h-[19rem] overflow-y-auto">
          {matches.map((o, i) => (
            <li key={o} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={`w-full text-start px-3 min-h-[48px] flex items-center justify-between gap-2 text-base ${i === active ? "bg-surface-2" : "active:bg-surface-2"}`}
              >
                <span className="truncate">{o}</span>
                {o === same && <Icon name="check" size={18} className="text-accent-ink shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {isNew && newHint && (
        <p className="text-xs text-accent-ink mt-1 flex items-center gap-1">
          <Icon name="plus" size={14} />
          {newHint(value.trim())}
        </p>
      )}
    </div>
  );
}
