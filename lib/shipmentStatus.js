// One vocabulary for shipment-request statuses, shared by the API routes
// and every screen that shows one — previously each page kept its own
// copy of these labels, and "cancelled" didn't exist in any of them.
//
//   pending_car1       car2 LOADING request waiting on car1's approval
//   pending_warehouse  waiting on the warehouse keeper
//   fulfilled          accepted and executed by the warehouse keeper
//   rejected           turned down by car1 (car2 loading only)
//   cancelled          cancelled by the warehouse keeper, with a note

const SHIPMENT_STATUS_LABELS = {
  pending_car1: "بانتظار موافقة مشرف المبيعات",
  pending_warehouse: "بانتظار تنفيذ أمين المخزن",
  rejected: "مرفوض",
  fulfilled: "تم التنفيذ",
  cancelled: "ملغى من أمين المخزن",
};

const SHIPMENT_STATUS_TONE = {
  pending_car1: "bg-amber-50 text-amber-700",
  pending_warehouse: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
  fulfilled: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
};

const SHIPMENT_TYPE_LABELS = { loading: "أمر شحن", offloading: "مرتجع بضاعة" };

// Still open = nobody has closed it yet. An agent may have only ONE open
// request at a time (see /api/shipment-requests/create.js).
const OPEN_STATUSES = ["pending_car1", "pending_warehouse"];
const isOpenStatus = (status) => OPEN_STATUSES.includes(status);

const MAX_CANCEL_NOTE = 500;

module.exports = {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_TONE,
  SHIPMENT_TYPE_LABELS,
  OPEN_STATUSES,
  isOpenStatus,
  MAX_CANCEL_NOTE,
};
