import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ROLE_LABELS } from "../lib/labels";
import { subscribeToken } from "../lib/currentToken";
import { useActionCount, REQUESTS_HREF } from "../lib/useActionCount";
import PendingActionModal from "./PendingActionModal";

const ROLE_HOME = {
  agent_car1: "/dashboard/car1",
  agent_car2: "/dashboard/car2",
  supervisor: "/dashboard/supervisor",
  warehouse_keeper: "/dashboard/warehouse",
};

export default function Nav({ role, logout }) {
  const router = useRouter();
  const [token, setToken] = useState(null);
  useEffect(() => subscribeToken(setToken), []);
  const actionCount = useActionCount(token, role);

  // Warehouse keeper gets only their four working sections — none of the
  // sales-side pages (clients, products, reports) are relevant to that job.
  const links =
    role === "warehouse_keeper"
      ? [
          { href: "/dashboard/warehouse", label: "الرئيسية" },
          { href: "/warehouse/inventory", label: "المخزون" },
          { href: "/warehouse/shipment-requests", label: "الطلبات" },
          { href: "/warehouse/car1", label: "مبيعات جملة" },
          { href: "/warehouse/car2", label: "مبيعات تجزئة" },
        ]
      : role === "depot_viewer"
      ? [{ href: "/warehouse/view-stock", label: "المخزن الرئيسي" }]
      : [
          role && { href: ROLE_HOME[role], label: "الرئيسية" },
          role !== "supervisor" && { href: "/place-order", label: "تسجيل فاتورة" },
          (role === "agent_car1" || role === "agent_car2") && { href: "/requests", label: "الطلبات" },
          role !== "supervisor" && { href: "/documents", label: "المستندات" },
          { href: "/register-client", label: "إضافة عميل" },
          { href: "/reports/sales", label: "تقرير المبيعات" },
          { href: "/clients", label: "العملاء" },
          { href: "/products", label: "المنتجات" },
          role === "supervisor" && { href: "/inventory", label: "المخزون" },
          role === "supervisor" && { href: "/requests", label: "الطلبات" },
          role === "supervisor" && { href: "/margin", label: "هامش التشغيل" },
        ].filter(Boolean);

  const requestsHref = REQUESTS_HREF[role];

  return (
    <nav className="bg-white border-b sticky top-0 z-20">
      <PendingActionModal role={role} count={actionCount} />
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-800">بوابة الفواتير</span>
          <div className="flex items-center gap-3">
            {role && <span className="text-xs text-gray-400 hidden sm:inline">{ROLE_LABELS[role]}</span>}
            <button
              onClick={logout}
              className="text-sm text-gray-500 active:text-gray-800 min-h-[44px] px-2"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
        {/* Horizontally scrollable on narrow screens instead of wrapping/cramping,
            with generous tap targets (min-h-[44px]) for touch use. */}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex items-center whitespace-nowrap min-h-[44px] px-3 rounded-lg text-sm ${
                router.pathname === link.href
                  ? "bg-gray-900 text-white font-medium"
                  : "text-gray-600 bg-gray-50 active:bg-gray-100"
              }`}
            >
              {link.label}
              {link.href === requestsHref && actionCount > 0 && (
                <span
                  className="absolute top-1 end-1 w-2 h-2 rounded-full bg-red-500"
                  aria-label={`${actionCount} بحاجة لإجراء`}
                />
              )}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
