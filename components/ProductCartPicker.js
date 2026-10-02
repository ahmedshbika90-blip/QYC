import { useEffect, useRef, useState } from "react";
import QtyStepper from "./QtyStepper";
import { formatQty } from "../lib/labels";

// Search a product, tap to add it, adjust quantity with a stepper.
// `hint(product)` optionally returns small text shown next to each result
// (e.g. current depot stock). Quantity 0 removes the line.
// `salesMode` shows the free-sample checkbox and per-line discount input —
// only meaningful for a client sale, not for warehouse receiving/loading
// carts, so it defaults to off.
// `maxFor(product)` caps a line's quantity at what's actually available
// (depot stock for a loading request, van stock for a return). Products
// with nothing available are shown greyed out and can't be added at all,
// so an impossible request can't even be typed.
export default function ProductCartPicker({ products, cart, setCart, hint, salesMode = false, maxFor }) {
  const capOf = (productId) => (maxFor ? maxFor(products.find((p) => p.id === productId)) : undefined);
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
    if (maxFor && (maxFor(p) ?? 0) <= 0) return;
    // Start at 1, or at everything available if that's less (e.g. 0.5 kg).
    const startQty = maxFor ? Math.min(1, maxFor(p)) : 1;
    setCart((prev) => [...prev, { productId: p.id, name: p.name, unit: p.unit, qty: startQty, freeSample: false, discount: 0 }]);
    setQuery("");
    setOpen(false);
  }

  function setQty(productId, qty) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((it) => it.productId !== productId));
      return;
    }
    const cap = capOf(productId);
    const capped = cap === undefined ? qty : Math.min(qty, cap);
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty: capped } : it)));
  }

  function toggleFreeSample(productId) {
    setCart((prev) =>
      prev.map((it) =>
        it.productId === productId ? { ...it, freeSample: !it.freeSample, discount: !it.freeSample ? 0 : it.discount } : it
      )
    );
  }

  function setDiscount(productId, value) {
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, discount: value } : it)));
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
                  disabled={maxFor ? (maxFor(p) ?? 0) <= 0 : false}
                  className="w-full text-start px-3 py-3 text-base active:bg-surface-2 border-b last:border-0 flex justify-between gap-2 min-h-[44px] disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span>{p.name}</span>
                  {maxFor && (maxFor(p) ?? 0) <= 0 ? (
                    <span className="text-amber-700 text-sm shrink-0">غير متوفر</span>
                  ) : (
                    hint && <span className="text-gray-400 text-sm shrink-0">{hint(p)}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border rounded-lg divide-y">
          {cart.map((it) => (
            <div key={it.productId} className="px-3 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base text-gray-800 truncate">
                  {it.name} <span className="text-xs text-gray-400">({it.unit})</span>
                </p>
                <QtyStepper value={it.qty} onChange={(v) => setQty(it.productId, v)} min={0} max={capOf(it.productId)} />
              </div>
              {capOf(it.productId) !== undefined && it.qty >= capOf(it.productId) && (
                <p className="text-xs text-amber-700">هذا كل المتاح ({formatQty(capOf(it.productId))})</p>
              )}
              {salesMode && (
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-1.5 text-gray-600">
                    <input
                      type="checkbox"
                      checked={Boolean(it.freeSample)}
                      onChange={() => toggleFreeSample(it.productId)}
                    />
                    عينة مجانية
                  </label>
                  {!it.freeSample && (
                    <label className="flex items-center gap-1.5 text-gray-600">
                      خصم
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.discount || ""}
                        onChange={(e) => setDiscount(it.productId, e.target.value)}
                        placeholder="0"
                        className="w-20 border rounded-lg px-2 h-8 text-sm"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
