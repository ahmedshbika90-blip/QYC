import Link from "next/link";
import { STATUS_LABELS } from "../lib/labels";

const STATUS_OPTIONS = ["pending", "delivered", "cancelled"];

const STATUS_DOT = {
  pending: "bg-amber-400",
  delivered: "bg-green-500",
  cancelled: "bg-red-400",
};

function itemsSummary(items) {
  if (items.length === 1) return `${items[0].name} ×${items[0].qty}`;
  return `${items[0].name} ×${items[0].qty} +${items.length - 1} أخرى`;
}

export default function OrderCard({ order, location, badge, subtitle, onStatusChange }) {
  return (
    <div className="bg-white rounded-lg shadow px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/orders/${order.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[order.status] || "bg-gray-300"}`} />
            <p className="font-medium text-gray-800 truncate">
              <span className="tabular-ltr">#{order.clientId}</span>
              {location && <span className="text-gray-400 font-normal"> · {location}</span>}
              {badge}
            </p>
          </div>
          <p className="text-sm text-gray-500 truncate mt-0.5">{itemsSummary(order.items)}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </Link>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-medium text-gray-800">{order.total ?? "—"}</span>
          <select
            value={order.status}
            onChange={(e) => onStatusChange(order.id, e.target.value)}
            className="border rounded-lg px-2 h-9 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
