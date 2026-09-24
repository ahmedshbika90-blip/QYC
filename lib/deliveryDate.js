const { WEEKDAYS, ROUTE_CONFIG } = require("./constants");

/**
 * Given a route ("car1" | "car2") and a reference date (defaults to now),
 * returns the delivery date for a new order.
 *
 * - car1: returns null. There is no fixed schedule; the agent contacts
 *   the client directly to arrange timing.
 * - car2: returns a Date representing the next occurrence of the route's
 *   fixed weekday, respecting the cutoff hour if the order is placed on
 *   the delivery day itself.
 */
function calculateDeliveryDate(route, now = new Date()) {
  const config = ROUTE_CONFIG[route];
  if (!config) throw new Error(`Unknown route: ${route}`);

  if (!config.fixedSchedule) {
    return null;
  }

  const targetDayIndex = WEEKDAYS.indexOf(config.deliveryDay);
  if (targetDayIndex === -1) {
    throw new Error(`Invalid deliveryDay in ROUTE_CONFIG for ${route}`);
  }

  const currentDayIndex = now.getDay();
  let daysUntilTarget = (targetDayIndex - currentDayIndex + 7) % 7;

  // If today IS the delivery day, check the cutoff.
  if (daysUntilTarget === 0) {
    const cutoff = new Date(now);
    cutoff.setHours(config.cutoffHour, 0, 0, 0);
    if (now > cutoff) {
      daysUntilTarget = 7; // rolled past cutoff, push to next week
    }
  }

  const deliveryDate = new Date(now);
  deliveryDate.setDate(now.getDate() + daysUntilTarget);
  deliveryDate.setHours(0, 0, 0, 0);
  return deliveryDate;
}

module.exports = { calculateDeliveryDate };
