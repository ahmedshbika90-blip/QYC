// Central place to configure route behavior.
// Change ROUTE_CONFIG.car2.deliveryDay if the fixed weekly day changes.

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const ROUTE_CONFIG = {
  car1: {
    label: "Car 1 (on-demand)",
    fixedSchedule: false, // orders handled as they arrive, agent contacts client directly
  },
  car2: {
    label: "Car 2 (fixed weekly route)",
    fixedSchedule: true,
    deliveryDay: "tuesday", // <-- set this to whatever the real fixed day is
    cutoffHour: 18, // orders placed after 18:00 on delivery day itself roll to next week
  },
};

module.exports = { WEEKDAYS, ROUTE_CONFIG };
