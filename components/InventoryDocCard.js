import Link from "next/link";
import { formatDateTime } from "../lib/labels";

const TYPE_LABELS = {
  received: "استلام بضاعة",
  loading: "تحميل",
  offloading: "تفريغ",
};

const MAX_PREVIEW = 3;

// Names only, sorted by quantity descending (the product with the most
// moved shows first) — no numbers here, the point is a quick glance, not
// the full manifest. Full item list + quantities live on the detail page.
function previewNames(items) {
  const sorted = [...items].sort((a, b) => b.qty - a.qty);
  const names = sorted.slice(0, MAX_PREVIEW).map((it) => it.name);
  return sorted.length > MAX_PREVIEW ? `${names.join("، ")}...` : names.join("، ");
}

export default function InventoryDocCard({ doc }) {
  return (
    <Link href={`/inventory/${doc.id}`} className="block p-4 active:bg-gray-50">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-800">
            {TYPE_LABELS[doc.type] || doc.type}
            {doc.route && (
              <span className="text-xs font-normal text-gray-400 ms-2">
                {doc.route === "car1" ? "السيارة ١" : "السيارة ٢"}
              </span>
            )}
          </p>
          <p className="text-sm text-gray-500 truncate mt-0.5">{previewNames(doc.items)}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDateTime(doc.createdAt)}</p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-lg shrink-0 ${
            doc.status === "confirmed"
              ? "bg-green-50 text-green-700"
              : doc.status === "rejected" || doc.status === "disputed"
              ? "bg-red-50 text-red-600"
              : "bg-amber-50 text-amber-600"
          }`}
        >
          {doc.status === "confirmed"
            ? "مؤكدة"
            : doc.status === "rejected"
            ? "مرفوضة"
            : doc.status === "disputed"
            ? "متنازع عليها"
            : "بانتظار الاعتماد"}
        </span>
      </div>
    </Link>
  );
}
