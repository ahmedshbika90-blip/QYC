// Single source of truth for staff roles. Roles live in Firebase Auth
// custom claims (`role`), set by the admin from /admin/users (or by
// scripts/setRole.js for the very first admin).
//
// Internal keys never change once data exists, so the two car roles keep
// their route-based keys even though their job titles changed:
//   agent_car1  → مشرف المبيعات  (sales supervisor, drives the wholesale van "car1")
//   agent_car2  → مندوب المبيعات (sales agent, drives the retail van "car2")
//
// "supervisor" was renamed to "manager". Accounts that still carry the old
// claim keep working: normalizeRole() maps it on the server (lib/apiAuth.js)
// and in the browser (lib/useAuth.js), so every check in the code only ever
// sees "manager". The admin page re-saves such accounts with the new key.

const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  SALES_SUPERVISOR: "agent_car1",
  SALES_AGENT: "agent_car2",
  WAREHOUSE_KEEPER: "warehouse_keeper",
  ACCOUNTANT: "accountant",
  EXECUTIVE: "executive",
  DEPOT_VIEWER: "depot_viewer",
};

const LEGACY_ROLE_ALIASES = { supervisor: ROLES.MANAGER };

function normalizeRole(role) {
  if (!role) return null;
  return LEGACY_ROLE_ALIASES[role] || role;
}

// Order = how they're listed on the admin page.
const ROLE_DEFS = [
  { id: ROLES.ADMIN, label: "مدير النظام", hint: "يدير الحسابات والصلاحيات فقط" },
  { id: ROLES.MANAGER, label: "المدير", hint: "كامل الصلاحيات التشغيلية: المخزون، الأسعار، الاعتمادات، التقارير" },
  { id: ROLES.SALES_SUPERVISOR, label: "مشرف المبيعات", hint: "سيارة الجملة (car1): فواتير، مخزون كل السيارات، اعتماد طلبات الشحن، سجل حركة البضاعة" },
  { id: ROLES.SALES_AGENT, label: "مندوب المبيعات", hint: "سيارة التجزئة (car2): فواتير وطلبات شحن لسيارته فقط" },
  { id: ROLES.WAREHOUSE_KEEPER, label: "أمين المخزن", hint: "استلام البضاعة وتنفيذ طلبات الشحن — بدون أسعار" },
  { id: ROLES.ACCOUNTANT, label: "المحاسب", hint: "يطّلع على كل المخزون ويسجّل المدفوعات على الفواتير" },
  { id: ROLES.EXECUTIVE, label: "الإدارة التنفيذية", hint: "لوحة متابعة للعرض فقط" },
  { id: ROLES.DEPOT_VIEWER, label: "مطّلع على المخزن الرئيسي", hint: "عرض رصيد المخزن الرئيسي فقط" },
];

const ASSIGNABLE_ROLES = ROLE_DEFS.map((r) => r.id);

const ROLE_LABELS = {
  ...Object.fromEntries(ROLE_DEFS.map((r) => [r.id, r.label])),
  // Still found on old records (e.g. createdByRole) written before the rename.
  supervisor: "المدير",
};

const ROLE_HOME = {
  [ROLES.ADMIN]: "/admin/users",
  [ROLES.MANAGER]: "/dashboard/supervisor",
  [ROLES.SALES_SUPERVISOR]: "/dashboard/car1",
  [ROLES.SALES_AGENT]: "/dashboard/car2",
  [ROLES.WAREHOUSE_KEEPER]: "/dashboard/warehouse",
  [ROLES.ACCOUNTANT]: "/accounting/invoices",
  [ROLES.EXECUTIVE]: "/executive",
  [ROLES.DEPOT_VIEWER]: "/warehouse/view-stock",
};

// Every route (sales van) in the system. Adding a van later starts here.
const ROUTES = ["car1", "car2"];

module.exports = { ROLES, ROLE_DEFS, ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_HOME, ROUTES, normalizeRole };
