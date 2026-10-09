// Which list tab an invoice belongs to (active / refunded / cancelled).
// A fully refunded invoice that had been paid stays with the ACTIVE ones,
// marked "awaiting money", until the money is given back — then it moves
// to the cancelled ones with its "refunded" note.
const isRefunded = (o) => Array.isArray(o.refunds) && o.refunds.length > 0;
const isCancelledTab = (o) => o.status === "cancelled" && o.refundStatus !== "awaitingMoney";
function filterByTab(list, tab) {
  if (tab === "refunded") return list.filter(isRefunded);
  if (tab === "cancelled") return list.filter(isCancelledTab);
  return list.filter((o) => !isCancelledTab(o));
}
function tabCounts(list) {
  return { active: list.filter((o) => !isCancelledTab(o)).length, refunded: list.filter(isRefunded).length, cancelled: list.filter(isCancelledTab).length };
}
module.exports = { isRefunded, isCancelledTab, filterByTab, tabCounts };
