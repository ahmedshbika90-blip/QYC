import { formatDateTime, formatNumber } from "../lib/labels";

// One list for stock adjustments and damage reports (warehouse, manager,
// accountant): what, which mode, items, status, who/when, margin effect.
export const KIND_LABEL = { writeoff: "تسوية تالف", freeSample: "عينات مجانية", damage: "تقرير تالف" };
// Plain names (warehouse keeper); with the margin effect for the manager and accountant.
export const MODE_NAME = { transfer: "مرتجع شركة", obsolete: "غير صالحة", supplier: "على المورد", company: "على الشركة" };
export const MODE_LABEL = { transfer: "مرتجع شركة (بدون قيمة)", obsolete: "غير صالحة (يُخصم من الهامش)", supplier: "على المورد (بدون قيمة)", company: "على الشركة (يُخصم من الهامش)" };
export const STATUS_LABEL = { pending: ["بانتظار القرار", "bg-amber-100 text-amber-900"], approved: ["معتمد", "bg-green-100 text-green-800"], rejected: ["مرفوض", "bg-red-100 text-red-800"] };

export default function AdjustmentList({ rows, actionsFor, showMargin = true }) {
  if (!rows.length) return <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-8 text-center">لا توجد حركات مطابقة.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((a) => {
        const [sl, st] = STATUS_LABEL[a.status] || [a.status, "bg-gray-100 text-gray-700"];
        return (
          <li key={`${a.kind}-${a.id}`} className="bg-white rounded-2xl shadow p-4 flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-ink break-words">
                  {KIND_LABEL[a.kind] || a.kind}
                  {a.mode && <span className="font-semibold text-ink-soft"> — {(showMargin ? MODE_LABEL : MODE_NAME)[a.mode]}</span>}
                </p>
                <p className="text-sm text-ink-soft break-words">
                  طُلب {formatDateTime(a.requestedAt)}
                  {a.requestedByName && <> · {a.requestedByName}</>}
                  {a.decidedAt && <> · {a.status === "rejected" ? "رُفض" : "اعتُمد"} {formatDateTime(a.decidedAt)}</>}
                </p>
              </div>
              <span className={`text-sm font-bold rounded-full px-3 py-1 ${st}`}>{sl}</span>
            </div>
            <ul className="text-ink break-words">
              {(a.items || []).map((i, k) => (
                <li key={k}>
                  {i.name} × <span className="num">{i.qty}</span> {i.unit || ""}
                  {showMargin && i.cost != null && <span className="text-sm text-ink-soft"> · تكلفة <span className="num">{formatNumber(i.cost)}</span></span>}
                </li>
              ))}
            </ul>
            {showMargin && a.status === "approved" && a.marginDeduction > 0 && (
              <p className="text-sm font-bold text-red-700">خُصم من الهامش: <span className="num">{formatNumber(a.marginDeduction)}</span> بتاريخ <span className="num">{a.decidedDay}</span></p>
            )}
            {a.note && <p className="text-sm text-ink-soft break-words">ملاحظة: {a.note}</p>}
            {a.decisionNote && <p className="text-sm text-ink-soft break-words">سبب القرار: {a.decisionNote}</p>}
            {actionsFor && actionsFor(a)}
          </li>
        );
      })}
    </ul>
  );
}
