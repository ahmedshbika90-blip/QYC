import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { ROUTES } from "../lib/roles";
import { ROUTE_LABELS_SHORT } from "../lib/labels";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import InventoryHistory from "../components/InventoryHistory";
import { PageLoading } from "../components/Loading";
import Icon from "../components/Icon";
import { allVanIds } from "../lib/vanNames";

// Sales supervisor (car1): every van's cargo movements — deliveries from
// the warehouse, returns, damage — the way the manager sees them, but only
// documents that were CONFIRMED (the server drops everything else; see
// /api/inventory/list?scope=fleet). Filter by van, type and dates.
export default function FleetHistory() {
  const { role, token, loading, logout, salesSupervisor } = useAuth(["agent_car1", "agent_car2"]);
  const [car, setCar] = useState("");
  if (loading) return <PageLoading />;
  if (!salesSupervisor) {
    return (
      <div className="min-h-screen bg-canvas">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-muted">هذه الصفحة لمشرف المبيعات فقط.</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <BackButton />
        <h1 className="font-display text-2xl font-bold mt-1 text-ink">حركة بضاعة السيارات</h1>
        <p className="text-sm text-muted mt-1 mb-4 flex items-start gap-1.5">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          المستندات المعتمدة فقط، لكل السيارات.
        </p>
        <div role="group" aria-label="السيارة" className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-4">
          {[["", "كل السيارات"], ...allVanIds().map((r) => [r, `${r} · ${ROUTE_LABELS_SHORT[r] || r}`])].map(([id, label]) => (
            <button
              key={id || "all"}
              type="button"
              aria-pressed={car === id}
              onClick={() => setCar(id)}
              className={`h-10 px-4 rounded-xl text-sm whitespace-nowrap border ${car === id ? "bg-accent text-on-accent border-accent font-semibold" : "bg-white text-ink-soft border-line"}`}
            >
              <span dir="auto">{label}</span>
            </button>
          ))}
        </div>
        <InventoryHistory
          token={token}
          scope="fleet"
          fixedRoute={car || undefined}
          showRouteFilter={false}
          excludePending
          emptyText="لا توجد حركات معتمدة في هذه الفترة."
        />
      </main>
    </div>
  );
}
