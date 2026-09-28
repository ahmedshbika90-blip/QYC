// Large +/- buttons instead of a tiny number field — much easier to tap
// accurately on a phone or tablet than typing into a narrow input.
export default function QtyStepper({ value, onChange, min = 0, max }) {
  const qty = value || 0;

  function dec() {
    onChange(Math.max(min, qty - 1));
  }
  function inc() {
    const next = qty + 1;
    onChange(max !== undefined ? Math.min(max, next) : next);
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
        type="number"
        inputMode="numeric"
        value={qty}
        onChange={(e) => {
          const next = Number(e.target.value) || 0;
          onChange(max !== undefined ? Math.min(max, Math.max(min, next)) : Math.max(min, next));
        }}
        className="w-14 h-11 text-center border rounded-lg text-base"
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
