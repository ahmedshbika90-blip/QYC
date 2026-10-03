// Invoice lock rules — used by the server (enforcement) and to describe
// lock state to the app. An invoice is LOCKED (agents need supervisor
// approval to edit or cancel it) when either:
//   - it's been 9 hours since it was created (computed from the time —
//     no stored field, no writes), or
//   - a sales report that included it was shared (lockedAt is set).
// Locked invoices are also the ones counted in the operating margin:
// they're the finalized sales.
const LOCK_AFTER_MS = 9 * 60 * 60 * 1000;

function lockInfo(order, now = Date.now()) {
  const until = Date.parse(order.createdAt) + LOCK_AFTER_MS;
  if (order.lockedAt) return { locked: true, lockReason: "reported", editableUntil: null };
  if (now >= until) return { locked: true, lockReason: "time", editableUntil: null };
  return { locked: false, lockReason: null, editableUntil: new Date(until).toISOString() };
}

function isLocked(order, now) {
  return lockInfo(order, now).locked;
}

// Cost data (supplier price) is supervisor-only.
function stripCost(items) {
  return (items || []).map(({ unitCost, ...rest }) => rest);
}

// The shape of an invoice as sent to the app: lock state computed on the
// SERVER's clock (so a wrong phone clock can't mislead anyone), and
// supervisor-only fields removed for everyone else.
function presentOrder(id, data, role) {
  const out = {
    id,
    ...data,
    ...lockInfo(data),
    edited: Boolean(data.editHistory?.length),
    // Shown to EVERY role as a comment on the invoice and used by the
    // "عينة مجانية" filter. Derived from the stored lines, so invoices that
    // already carry the flag need no migration.
    hasFreeSample: (data.items || []).some((it) => it.freeSample),
    // A line sold above its list price (lib/linePrice.js) — shown as a tag
    // on the invoice card and used by the "سعر معدّل" filter.
    hasPriceAdjustment: (data.items || []).some((it) => it.priceAdjusted),
  };
  if (role !== "supervisor") {
    delete out.editHistory;
    out.items = stripCost(out.items);
  }
  return out;
}

module.exports = { LOCK_AFTER_MS, lockInfo, isLocked, stripCost, presentOrder };
