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

// Fixed lists for the product form (supervisor → كتالوج المنتجات).
// Product type is stored in the product's `category` field. Products
// created before these lists existed keep their old free-text values
// until someone edits them; any edit must pick from these lists.
const PRODUCT_CATEGORIES = ["طحنية", "طحينة", "شبس"];
const PRODUCT_UNITS = ["جردل", "بكت", "كرتونة"];

// How product categories roll up into the two groups the supervisor
// dashboard shows. A product whose category isn't listed (or is empty)
// falls back to a name check, then to "أخرى" — it is never silently
// counted under the wrong group.
const PRODUCT_GROUPS = [
  { id: "alwafi", label: "منتجات الوفي", categories: ["طحنية", "طحينة"] },
  { id: "snacks", label: "السناكس", categories: ["شبس"] },
];

module.exports = { WEEKDAYS, ROUTE_CONFIG, PRODUCT_CATEGORIES, PRODUCT_UNITS, PRODUCT_GROUPS };
