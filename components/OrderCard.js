import Link from "next/link";

function itemsSummary(items) {
  if (items.length === 1) return `${items[0].name} ×${items[0].qty}`;
  return `${items[0].name} ×${items[0].qty} +${items.length - 1} أخرى`;
}

// An invoice is either active or cancelled — no multi-step status to pick
// from. Cancelling is a deliberate one-way action (confirmed first, like
// deleting a product), never a delete: the invoice stays on record, just
// marked cancelled and excluded from the sales report.
export default function OrderCard({ order, name, location, badge, subtitle, onStatusChange }) {
  const isCancelled = order.status === "cancelled";

  function handleCancel() {
    if (confirm("إلغاء هذه الفاتورة؟ ستبقى في السجل لكنها لن تُحتسب ضمن المبيعات.")) {
      onStatusChange(order.id, "cancelled");
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow px-4 py-3 ${isCancelled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Link href={`/orders/${order.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isCancelled ? "bg-red-400" : "bg-green-500"}`} />
            <p className="font-medium text-gray-800 truncate">
              {name || <span className="tabular-ltr">#{order.clientId}</span>}
              {location && <span className="text-gray-400 font-normal"> · {location}</span>}
              {badge}
            </p>
          </div>
          <p className={`text-sm text-gray-500 truncate mt-0.5 ${isCancelled ? "line-through" : ""}`}>
            {itemsSummary(order.items)}
          </p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </Link>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-medium text-gray-800">{order.total ?? "—"}</span>
          {isCancelled ? (
            <span className="text-xs text-red-500 px-2 h-9 flex items-center">ملغاة</span>
          ) : (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-red-600 bg-red-50 active:bg-red-100 rounded-lg px-3 h-9"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
