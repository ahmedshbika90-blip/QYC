// Payment state of an invoice, for the accountant's screens only.
const STYLE = {
  unpaid: ["غير مدفوعة", "bg-amber-100 text-amber-700"],
  partial: ["مدفوعة جزئيًا", "bg-blue-100 text-blue-700"],
  paid: ["مدفوعة بالكامل", "bg-green-100 text-green-700"],
  over: ["مدفوع أكثر من قيمتها", "bg-red-100 text-red-700"],
  cancelled: ["فاتورة ملغاة", "bg-gray-100 text-gray-600"],
  cancelledPaid: ["ملغاة وعليها دفعات", "bg-red-100 text-red-700"],
};

export const PAYMENT_FILTERS = [
  ["unpaid", STYLE.unpaid[0]],
  ["partial", STYLE.partial[0]],
  ["paid", STYLE.paid[0]],
];

export default function PaymentBadge({ status, className = "" }) {
  const [label, tone] = STYLE[status] || STYLE.unpaid;
  return <span className={`h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center whitespace-nowrap ${tone} ${className}`}>{label}</span>;
}
