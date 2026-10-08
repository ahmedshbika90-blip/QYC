// Single source of truth for staff roles. Roles live in Firebase Auth
// custom claims (`role`), set by the admin from /admin/users (or by
// scripts/setRole.js for the very first admin).
//
// Sales staff: the admin picks the JOB (sales supervisor or sales agent)
// and the ROUTE (wholesale = car1 van, retail = car2 van) separately. They
// are stored as two claims:
//   role             "agent_car1" | "agent_car2"   → which van/route
//   salesSupervisor  true | false                 → supervisor powers
// The route-keyed role stays because every invoice, client and stock rule
// in the app is keyed on it. Accounts made before this split carry no
// salesSupervisor claim: the wholesale ones were the supervisors, so they
// default to true and the retail ones to false (salesFlags below).
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

// The jobs the admin chooses from, in display order. The two sales jobs
// also need a route (SALES_ROUTES).
const ROLE_DEFS = [
  { id: ROLES.ADMIN, label: "مدير النظام", hint: "يدير الحسابات والصلاحيات فقط" },
  { id: ROLES.MANAGER, label: "المدير", hint: "كامل الصلاحيات التشغيلية: المخزون، الأسعار، الاعتمادات، التقارير" },
  { id: "sales_supervisor", sales: true, label: "مشرف المبيعات", hint: "فواتير لمساره، مخزون كل السيارات، اعتماد طلبات شحن المندوبين، سجل حركة بضاعة السيارات" },
  { id: "sales_agent", sales: true, label: "مندوب المبيعات", hint: "فواتير وطلبات شحن لسيارته فقط" },
  { id: ROLES.WAREHOUSE_KEEPER, label: "أمين المخزن", hint: "استلام البضاعة وتنفيذ طلبات الشحن — بدون أسعار" },
  { id: ROLES.ACCOUNTANT, label: "المحاسب", hint: "يطّلع على كل المخزون ويسجّل المدفوعات على الفواتير" },
  { id: ROLES.EXECUTIVE, label: "الإدارة التنفيذية", hint: "لوحة متابعة للعرض فقط" },
  { id: ROLES.DEPOT_VIEWER, label: "مطّلع على المخزن الرئيسي", hint: "عرض رصيد المخزن الرئيسي فقط" },
];

const SALES_ROUTES = [
  { route: "car1", role: ROLES.SALES_SUPERVISOR, label: "جملة" },
  { route: "car2", role: ROLES.SALES_AGENT, label: "تجزئة" },
];
const ROUTE_TO_ROLE = Object.fromEntries(SALES_ROUTES.map((r) => [r.route, r.role]));
const ROLE_TO_ROUTE = Object.fromEntries(SALES_ROUTES.map((r) => [r.role, r.route]));

// Every stored claim value the admin may set.
const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_SUPERVISOR, ROLES.SALES_AGENT, ROLES.WAREHOUSE_KEEPER, ROLES.ACCOUNTANT, ROLES.EXECUTIVE, ROLES.DEPOT_VIEWER];

/** { route, salesSupervisor } for a token / claims object (route null for non-sales). */
function salesFlags(claims) {
  const role = normalizeRole(claims?.role);
  const route = ROLE_TO_ROUTE[role] || null;
  if (!route) return { route: null, salesSupervisor: false };
  const flag = claims.salesSupervisor;
  return { route, salesSupervisor: typeof flag === "boolean" ? flag : role === ROLES.SALES_SUPERVISOR };
}

/** The admin page's view of an account's job: a ROLE_DEFS id. */
function jobOf(claims) {
  const role = normalizeRole(claims?.role);
  if (!ROLE_TO_ROUTE[role]) return role;
  return salesFlags(claims).salesSupervisor ? "sales_supervisor" : "sales_agent";
}

/** Job title for a signed-in person, e.g. "مشرف المبيعات — جملة". */
function jobTitle(role, salesSupervisor) {
  const route = ROLE_TO_ROUTE[role];
  if (!route) return ROLE_LABELS[role] || "";
  const routeLabel = SALES_ROUTES.find((r) => r.route === route).label;
  return `${salesSupervisor ? "مشرف المبيعات" : "مندوب المبيعات"} — ${routeLabel}`;
}

const ROLE_LABELS = {
  ...Object.fromEntries(ROLE_DEFS.filter((r) => !r.sales).map((r) => [r.id, r.label])),
  sales_supervisor: "مشرف المبيعات",
  sales_agent: "مندوب المبيعات",
  [ROLES.SALES_SUPERVISOR]: "مبيعات جملة",
  [ROLES.SALES_AGENT]: "مبيعات تجزئة",
  // Still found on old records (e.g. createdByRole) written before the rename.
  supervisor: "المدير",
};

const ROLE_HOME = {
  [ROLES.ADMIN]: "/admin/users",
  [ROLES.MANAGER]: "/dashboard/supervisor",
  [ROLES.SALES_SUPERVISOR]: "/dashboard/car1",
  [ROLES.SALES_AGENT]: "/dashboard/car2",
  [ROLES.WAREHOUSE_KEEPER]: "/dashboard/warehouse",
  [ROLES.ACCOUNTANT]: "/accounting/agents",
  [ROLES.EXECUTIVE]: "/executive",
  [ROLES.DEPOT_VIEWER]: "/warehouse/view-stock",
};

// Every route (sales van) in the system. Adding a van later starts here.
const ROUTES = ["car1", "car2"];

module.exports = {
  ROLES,
  ROLE_DEFS,
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_HOME,
  ROUTES,
  SALES_ROUTES,
  ROUTE_TO_ROLE,
  ROLE_TO_ROUTE,
  normalizeRole,
  salesFlags,
  jobOf,
  jobTitle,
};
