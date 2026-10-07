import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

const NEW = "__new__";
const field = "w-full border rounded-lg px-3 h-12 text-base";

/** Routes already in use on these clients, A→Z, spelled the way they were saved. */
export function routesFromClients(clients, salesRoute) {
  const set = new Set();
  for (const c of clients || []) {
    if (salesRoute && c.route !== salesRoute) continue;
    const r = (c.deliveryRoute || "").trim();
    if (r) set.add(r);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ar"));
}

// المسار — pick one of the routes already added, or add a new one.
// Same big-target layout as the invoice form: one full-width 48px control,
// the "new route" box opening in place of the list, never a pop-over.
export default function DeliveryRoutePicker({ value, onChange, options, id = "delivery-route", required = true }) {
  const known = options.includes(value);
  const [adding, setAdding] = useState(() => Boolean(value) && !known);
  const inputRef = useRef(null);

  // Nothing added yet → typing is the only way.
  const typeOnly = options.length === 0;
  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);
  // Typed before the list arrived (slow connection)? Keep showing the text box.
  useEffect(() => {
    if (value && !known && !adding) setAdding(true);
  }, [value, known, adding]);

  if (typeOnly || adding) {
    return (
      <div>
        <label htmlFor={id} className="block text-sm text-gray-600 mb-1">
          المسار {typeOnly ? "" : "(جديد)"}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="text"
          enterKeyHint="next"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={60}
          placeholder="مثال: خط بحري"
          className={field}
          autoComplete="off"
          required={required}
        />
        {typeOnly ? (
          <p className="text-xs text-muted mt-1">أول مسار تضيفه — سيظهر في القائمة للعملاء القادمين.</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              onChange("");
            }}
            className="mt-1 text-sm text-accent-ink font-semibold min-h-[44px] flex items-center gap-1"
          >
            <Icon name="chevronRight" size={16} />
            الاختيار من المسارات المضافة
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-600 mb-1">المسار</label>
      <select
        id={id}
        value={known ? value : ""}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setAdding(true);
            onChange("");
          } else onChange(e.target.value);
        }}
        className={`${field} bg-white`}
        required={required}
      >
        <option value="" disabled>اختر المسار</option>
        {options.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
        <option value={NEW}>+ إضافة مسار جديد</option>
      </select>
    </div>
  );
}
