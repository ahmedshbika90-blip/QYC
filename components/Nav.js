import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ROLE_LABELS } from "../lib/labels";
import { subscribeAuth } from "../lib/currentToken";
import { useNotifications } from "../lib/useNotifications";
import { useTheme } from "../lib/theme";
import PendingActionModal from "./PendingActionModal";
import NotificationToastStack from "./NotificationToast";
import Icon from "./Icon";

const ROLE_HOME = {
  agent_car1: "/dashboard/car1",
  agent_car2: "/dashboard/car2",
  supervisor: "/dashboard/supervisor",
  warehouse_keeper: "/dashboard/warehouse",
  depot_viewer: "/warehouse/view-stock",
};

// Every destination, once. `badge` names which notification counter
// lights it up: "modification" (invoice edit/cancel requests) or
// "shipping" (shipping orders / cargo returns).
const L = {
  placeOrder: { href: "/place-order", label: "فاتورة جديدة", short: "فاتورة", icon: "plus" },
  requests: { href: "/requests", label: "الطلبات", icon: "inbox", badge: "modification" },
  documents: { href: "/documents", label: "المستندات", icon: "file", badge: "shipping" },
  registerClient: { href: "/register-client", label: "إضافة عميل", icon: "userPlus" },
  sales: { href: "/reports/sales", label: "تقرير المبيعات", short: "التقارير", icon: "chart" },
  clients: { href: "/clients", label: "العملاء", icon: "users" },
  products: { href: "/products", label: "المنتجات والأسعار", short: "المنتجات", icon: "tag" },
  inventory: { href: "/inventory", label: "المخزون", icon: "box" },
  margin: { href: "/margin", label: "هامش التشغيل", icon: "percent" },
  whInventory: { href: "/warehouse/inventory", label: "المخزون", icon: "box" },
  whShip: { href: "/warehouse/shipment-requests", label: "طلبات الشحن", short: "شحن", icon: "truck", badge: "shipping" },
  whCar1: { href: "/warehouse/car1", label: "مبيعات جملة", short: "جملة", icon: "warehouse" },
  whCar2: { href: "/warehouse/car2", label: "مبيعات تجزئة", short: "تجزئة", icon: "warehouse" },
  viewStock: { href: "/warehouse/view-stock", label: "المخزن الرئيسي", icon: "box" },
};

// Per role: `tabs` = the mobile bottom bar (most-used first, max 4 +
// optional centre action), `more` = everything else, in the "المزيد"
// sheet. `desktop` = the full top-bar order on wide screens.
//
// For agents, documents comes BEFORE requests everywhere it appears —
// documents (shipment deliveries) are the more time-sensitive queue
// because they gate stock movement.
function layoutFor(role) {
  const home = { href: ROLE_HOME[role], label: "الرئيسية", icon: "home" };
  switch (role) {
    case "agent_car1":
    case "agent_car2":
      return {
        tabs: [home, L.documents, L.clients],
        center: L.placeOrder,
        more: [L.requests, L.registerClient, L.sales, L.products],
        desktop: [home, L.placeOrder, L.documents, L.requests, L.clients, L.registerClient, L.sales, L.products],
      };
    case "supervisor":
      return {
        tabs: [home, L.requests, L.inventory, L.sales],
        more: [L.margin, L.clients, L.products, L.registerClient],
        desktop: [home, L.requests, L.inventory, L.sales, L.margin, L.clients, L.products, L.registerClient],
      };
    case "warehouse_keeper":
      return {
        tabs: [home, L.whInventory, L.whShip, L.whCar1, L.whCar2],
        more: [],
        desktop: [home, L.whInventory, L.whShip, L.whCar1, L.whCar2],
      };
    case "depot_viewer":
      return { tabs: [], more: [], desktop: [L.viewStock] };
    default:
      return { tabs: [], more: [], desktop: [] };
  }
}

function isActive(pathname, href) {
  if (!href) return false;
  if (href.startsWith("/dashboard")) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function Badge({ count, className = "" }) {
  if (!count) return null;
  return (
    <span
      className={`min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold leading-none flex items-center justify-center num ${className}`}
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> بحاجة لإجراء</span>
    </span>
  );
}

function ThemeSwitch({ pref, choose }) {
  const opts = [
    ["light", "فاتح", "sun"],
    ["dark", "داكن", "moon"],
    ["system", "تلقائي", "refresh"],
  ];
  return (
    <div role="radiogroup" aria-label="المظهر" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2">
      {opts.map(([value, label, icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          onClick={() => choose(value)}
          className={`h-10 rounded-lg text-sm flex items-center justify-center gap-1.5 ${
            pref === value ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"
          }`}
        >
          <Icon name={icon} size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Nav({ role, logout }) {
  const router = useRouter();
  const [auth, setAuth] = useState({ token: null, uid: null });
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => subscribeAuth(setAuth), []);
  const { items, modificationCount, shippingCount, refreshSeen, toasts, dismissToast } = useNotifications(
    auth.token,
    role,
    auth.uid
  );
  const { pref, isDark, choose, toggle } = useTheme();

  // The badge on a nav item is a "you have work here" indicator, not a
  // ticker of everything that ever happened. Once something is decided
  // (approved / rejected / fulfilled / confirmed), it stops counting —
  // only items that still need YOUR action light up the dot.
  //
  // We derive counts from `items` (which carries needsAction and badge)
  // instead of trusting the hook's raw counts, which historically
  // included resolved-but-unseen items too.
  const { modificationCountActive, shippingCountActive } = useMemo(() => {
    const list = items || [];
    const isActionable = (it) => {
      if (it?.needsAction === true) return true;
      if (it?.needsAction === false) return false;
      // Fallback for items that don't set needsAction: infer from state.
      const s = String(it?.state || it?.status || "").toLowerCase();
      if (!s) return true;
      return !/(approved|rejected|fulfilled|confirmed|cancelled|resolved|done)/.test(s);
    };
    let mod = 0;
    let ship = 0;
    for (const it of list) {
      if (!isActionable(it)) continue;
      if (it.badge === "modification") mod += 1;
      else if (it.badge === "shipping") ship += 1;
    }
    return {
      modificationCountActive: mod || modificationCount || 0,
      shippingCountActive: ship, // authoritative — resolved never counts
    };
  }, [items, modificationCount]);

  const layout = layoutFor(role);
  const hasTabbar = layout.tabs.length > 0;
  const counts = { modification: modificationCountActive, shipping: shippingCountActive };
  const countFor = (link) => (link.badge ? counts[link.badge] || 0 : 0);
  const moreCount = layout.more.reduce((n, l) => n + countFor(l), 0);
  const moreActive = layout.more.some((l) => isActive(router.pathname, l.href));

  // Tell the page to leave room for the fixed tab bar on phones.
  useEffect(() => {
    document.body.classList.toggle("has-tabbar", hasTabbar);
    return () => document.body.classList.remove("has-tabbar");
  }, [hasTabbar]);

  // Close the sheet on navigation and on Escape.
  useEffect(() => {
    const close = () => setSheetOpen(false);
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const iconBtn =
    "w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface-2 active:bg-surface-2";

  return (
    <>
      <PendingActionModal role={role} uid={auth.uid} items={items} refreshSeen={refreshSeen} />
      <NotificationToastStack toasts={toasts} uid={auth.uid} onDismiss={dismissToast} refreshSeen={refreshSeen} />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-canvas/85 backdrop-blur-md border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link href={ROLE_HOME[role] || "/"} className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-accent text-on-accent flex items-center justify-center">
              <Icon name="route" size={20} strokeWidth={2.2} />
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="font-display font-bold text-lg text-ink">مسار</span>
              {role && <span className="text-xs text-muted truncate md:hidden xl:block">{ROLE_LABELS[role]}</span>}
            </span>
          </Link>

          {/* Desktop links */}
          <nav aria-label="التنقل الرئيسي" className="hidden md:flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
            {layout.desktop.map((link) => {
              const active = isActive(router.pathname, link.href);
              const n = countFor(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-1.5 whitespace-nowrap h-10 px-2.5 rounded-xl text-[13px] lg:text-sm ${
                    active ? "bg-accent-soft text-accent-ink font-semibold" : "text-ink-soft hover:bg-surface-2"
                  }`}
                >
                  <Icon name={link.icon} size={17} className="hidden lg:block" />
                  {link.short || link.label}
                  <Badge count={n} />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={toggle} className={iconBtn} aria-label={isDark ? "الوضع الفاتح" : "الوضع الداكن"}>
              <Icon name={isDark ? "sun" : "moon"} />
            </button>
            <button type="button" onClick={logout} className={iconBtn} aria-label="تسجيل الخروج">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom tab bar ─────────────────────────────────── */}
      {hasTabbar && (
        <nav
          aria-label="التنقل الرئيسي"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-line"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-end justify-around h-[4.75rem] px-1 pb-2">
            {[
              ...layout.tabs.slice(0, layout.center ? 2 : 5),
              ...(layout.center ? ["__center"] : []),
              ...(layout.center ? layout.tabs.slice(2) : []),
              ...(layout.more.length ? ["__more"] : []),
            ].map((link) => {
              if (link === "__center") {
                const c = layout.center;
                return (
                  <Link
                    key="center"
                    href={c.href}
                    aria-current={isActive(router.pathname, c.href) ? "page" : undefined}
                    className="flex-1 flex flex-col items-center gap-1 text-[11px] font-semibold text-ink"
                  >
                    <span className="w-14 h-14 -mt-5 rounded-2xl bg-accent text-on-accent flex items-center justify-center shadow-lg">
                      <Icon name={c.icon} size={26} strokeWidth={2.6} />
                    </span>
                    {c.short || c.label}
                  </Link>
                );
              }
              if (link === "__more") {
                return (
                  <button
                    key="more"
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={sheetOpen}
                    className={`flex-1 h-14 flex flex-col items-center justify-center gap-1 text-[11px] ${
                      moreActive ? "text-accent-ink font-semibold" : "text-muted"
                    }`}
                  >
                    <span className="relative">
                      <Icon name="more" size={22} strokeWidth={2.4} />
                      {moreCount > 0 && <span className="absolute -top-0.5 -end-1 w-2.5 h-2.5 rounded-full bg-amber-600 ring-2 ring-white" />}
                    </span>
                    المزيد
                  </button>
                );
              }
              const active = isActive(router.pathname, link.href);
              const n = countFor(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex-1 h-14 flex flex-col items-center justify-center gap-1 text-[11px] ${
                    active ? "text-accent-ink font-semibold" : "text-muted"
                  }`}
                >
                  <span className="relative">
                    <Icon name={link.icon} size={22} strokeWidth={active ? 2.3 : 2} />
                    <Badge count={n} className="absolute -top-2 -end-3" />
                  </span>
                  {link.short || link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── "المزيد" sheet ────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="المزيد">
          <button type="button" aria-label="إغلاق" onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-black/50" />
          <div
            className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl p-4 pt-3 flex flex-col gap-3 shadow-lg"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <span className="mx-auto w-10 h-1.5 rounded-full bg-gray-200" />
            <div className="flex flex-col">
              {layout.more.map((link) => {
                const n = countFor(link);
                const active = isActive(router.pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`h-14 px-3 rounded-xl flex items-center gap-3 text-base ${
                      active ? "bg-accent-soft text-accent-ink font-semibold" : "text-ink active:bg-surface-2"
                    }`}
                  >
                    <span className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-ink-soft">
                      <Icon name={link.icon} />
                    </span>
                    <span className="flex-1">{link.label}</span>
                    <Badge count={n} />
                    <Icon name="chevronLeft" size={18} className="text-gray-400" />
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-line pt-3 flex flex-col gap-3">
              <ThemeSwitch pref={pref} choose={choose} />
              <button
                type="button"
                onClick={logout}
                className="h-12 rounded-xl flex items-center justify-center gap-2 text-red-600 bg-red-50 font-semibold"
              >
                <Icon name="logout" size={18} />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
