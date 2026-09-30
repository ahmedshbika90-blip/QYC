import Link from "next/link";
import { formatNumber } from "../lib/labels";
import Icon from "./Icon";

function itemsSummary(items) {
  if (items.length === 1) return `${items[0].name} ×${items[0].qty}`;
  return `${items[0].name} ×${items[0].qty} +${items.length - 1} أخرى`;
}

// An invoice is either active or cancelled — no multi-step status to pick
// from. Cancelling is a deliberate one-way action (confirmed first, like
// deleting a product), never a delete: the invoice stays on record, just
// marked cancelled and excluded from the sales report.
// canCancel: false for an agent viewing a locked invoice — they must open
// it and send a request instead, so no button that would only be refused.
export default function OrderCard({ order, name, location, badge, subtitle, edited, onStatusChange, canCancel = true }) {
  const isCancelled = order.status === "cancelled";

  function handleCancel() {
    if (confirm("إلغاء هذه الفاتورة؟ ستبقى في السجل لكنها لن تُحتسب ضمن المبيعات.")) {
      onStatusChange(order.id, "cancelled");
    }
  }

  // Two initials as a quick visual anchor when scanning a long list.
  // Arabic names: skip the definite article "ال" so "درة الصافية" → "دص".
  const initials =
    (name || "")
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/^ال(?=.)/, ""))
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "#";

  return (
    <div className={`bg-white rounded-2xl shadow px-3.5 py-3 ${isCancelled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <Link href={`/orders/${order.id}`} className="min-w-0 flex-1 flex items-center gap-3">
          <span
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-display font-bold text-[15px] ${
              isCancelled ? "bg-red-50 text-red-600" : "bg-accent-soft text-accent-ink"
            }`}
          >
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-ink truncate">
                {name || <span className="tabular-ltr">#{order.clientId}</span>}
              </span>
              {badge}
            </span>
            {location && <span className="block text-xs text-muted truncate">{location}</span>}
            <span className={`block text-sm text-ink-soft truncate mt-0.5 ${isCancelled ? "line-through" : ""}`}>
              {itemsSummary(order.items)}
            </span>
            {(edited || order.pendingRequest) && (
              <span className="flex flex-wrap gap-1.5 mt-1.5">
                {edited && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5">معدّلة</span>}
                {order.pendingRequest && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5">طلب بانتظار الموافقة</span>
                )}
              </span>
            )}
            {subtitle && <span className="block text-xs text-muted mt-1">{subtitle}</span>}
          </span>
        </Link>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="num text-[15px] font-semibold text-ink tabular-ltr">
            {order.total != null ? formatNumber(order.total) : "—"}
          </span>
          {isCancelled ? (
            <span className="text-xs font-semibold text-red-600 bg-red-50 rounded-lg px-2.5 h-8 flex items-center">ملغاة</span>
          ) : !canCancel || order.pendingRequest ? (
            <span className="text-gray-400 h-8 w-8 flex items-center justify-center" title="مقفلة — افتح الفاتورة لإرسال طلب">
              <Icon name="lock" size={16} />
              <span className="sr-only">مقفلة</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs font-semibold text-red-600 bg-red-50 active:bg-red-100 rounded-lg px-3 h-8"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
