import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../lib/useAuth";

const ROLE_HOME = {
  agent_car1: "/dashboard/car1",
  agent_car2: "/dashboard/car2",
  supervisor: "/dashboard/supervisor",
};

const ROLE_LABEL = {
  agent_car1: "Car 1 Agent",
  agent_car2: "Car 2 Agent",
  supervisor: "Supervisor",
};

export default function Nav({ role, logout }) {
  const router = useRouter();

  const links = [
    role && { href: ROLE_HOME[role], label: "Dashboard" },
    role !== "supervisor" && { href: "/place-order", label: "Place Order" },
    { href: "/clients", label: "Clients" },
    { href: "/register-client", label: "Add Client" },
    { href: "/products", label: "Products" },
  ].filter(Boolean);

  return (
    <nav className="bg-white border-b">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-800">Order Portal</span>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm ${
                router.pathname === link.href
                  ? "text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {role && <span className="text-xs text-gray-400">{ROLE_LABEL[role]}</span>}
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
