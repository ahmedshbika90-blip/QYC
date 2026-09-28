import { useEffect, useRef, useState } from "react";
import QtyStepper from "./QtyStepper";

// Search a product, tap to add it, adjust quantity with a stepper.
// `hint(product)` optionally returns small text shown next to each result
// (e.g. current depot stock). Quantity 0 removes the line.
export default function ProductCartPicker({ products, cart, setCart, hint }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function outside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
    };
  }, []);

  const inCart = new Set(cart.map((it) => it.productId));
  const results = products
    .filter((p) => !inCart.has(p.id))
    .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  function add(p) {
    setCart((prev) => [...prev, { productId: p.id, name: p.name, unit: p.unit, qty: 1 }]);
    setQuery("");
    setOpen(false);
  }

  function setQty(productId, qty) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((it) => it.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty } : it)));
  }

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="أضف منتجًا..."
          className="w-full border rounded-lg px-3 h-12 text-base"
        />
        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">لا توجد منتجات مطابقة</p>
            ) : (
              results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => add(p)}
                  className="w-full text-start px-3 py-3 text-base active:bg-gray-100 border-b last:border-0 flex justify-between gap-2 min-h-[44px]"
                >
                  <span>{p.name}</span>
                  {hint && <span className="text-gray-400 text-sm shrink-0">{hint(p)}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border rounded-lg divide-y">
          {cart.map((it) => (
            <div key={it.productId} className="flex items-center justify-between px-3 py-3 gap-3">
              <p className="text-base text-gray-800 truncate">
                {it.name} <span className="text-xs text-gray-400">({it.unit})</span>
              </p>
              <QtyStepper value={it.qty} onChange={(v) => setQty(it.productId, v)} min={0} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
