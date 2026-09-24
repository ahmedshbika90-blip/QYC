import Link from "next/link";
import { useRouter } from "next/router";
import { ROLE_LABELS } from "../lib/labels";

const ROLE_HOME = {
  agent_car1: "/dashboard/car1",
  agent_car2: "/dashboard/car2",
  supervisor: "/dashboard/supervisor",
};

export default function Nav({ role, logout }) {
  const router = useRouter();

  const links = [
    role && { href: ROLE_HOME[role], label: "الرئيسية" },
    role !== "supervisor" && { href: "/place-order", label: "تسجيل طلب" },
    { href: "/register-client", label: "إضافة عميل" },
    { href: "/reports/sales", label: "تقرير المبيعات" },
    { href: "/clients", label: "العملاء" },
    { href: "/products", label: "المنتجات" },
  ].filter(Boolean);

  return (
    <nav className="bg-white border-b sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-800">بوابة الطلبات</span>
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
              className={`flex items-center whitespace-nowrap min-h-[44px] px-3 rounded-lg text-sm ${
                router.pathname === link.href
                  ? "bg-gray-900 text-white font-medium"
                  : "text-gray-600 bg-gray-50 active:bg-gray-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
