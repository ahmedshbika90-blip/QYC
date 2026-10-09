import Link from "next/link";
import { formatDateTime, formatNumber } from "../lib/labels";
import { FIELD_LABELS } from "../lib/clientFields";

import { vanName, vanShort } from "../lib/vanNames";
const STATUS = {
  pending: ["بانتظار القرار", "bg-amber-50 text-amber-700"],
  approved: ["موافق عليه", "bg-green-50 text-green-700"],
  rejected: ["مرفوض", "bg-red-50 text-red-600"],
};

export default function RequestCard({ request: r }) {
  const [label, cls] = STATUS[r.status] || ["", ""];
  return (
    <Link href={`/requests/${r.id}`} className="block p-4 active:bg-gray-50">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-800 truncate">
            {r.type === "cancel" ? "طلب إلغاء" : r.type === "client_edit" ? "تعديل بيانات عميل" : r.type === "refund" ? "طلب مرتجع" : "طلب تعديل"} —{" "}
            {r.clientName || `#${r.clientId}`}
            <span className="text-xs font-normal text-gray-400 ms-2">{vanName(r.route)}</span>
          </p>
          <p className="text-sm text-gray-500 truncate mt-0.5">
            {r.type === "client_edit"
              ? `تغيير: ${Object.keys(r.proposedClient || {}).map((k) => FIELD_LABELS[k] || k).join("، ")}`
              : r.type === "edit"
              ? `الإجمالي: ${formatNumber(r.currentTotal)} ← ${formatNumber(r.proposedTotal)}`
              : r.type === "refund"
              ? `مرتجع بقيمة ${formatNumber(r.refundPreview?.value || 0)}`
              : `إلغاء فاتورة بقيمة ${formatNumber(r.currentTotal)}`}
            {r.reason && ` · ${r.reason}`}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {r.status === "pending" ? `طُلب ${formatDateTime(r.requestedAt)}` : `القرار ${formatDateTime(r.decidedAt)}`}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${cls}`}>{label}</span>
      </div>
    </Link>
  );
}
