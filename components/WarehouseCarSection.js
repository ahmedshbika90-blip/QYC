import { useAuth } from "../lib/useAuth";
import Nav from "./Nav";
import BackButton from "./BackButton";
import InventoryHistory from "./InventoryHistory";
import WarehouseRequestQueue from "./WarehouseRequestQueue";
import { PageLoading } from "./Loading";
import { SectionTitle } from "./Today";

const CAR_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };

// One car's section for the warehouse keeper. Requests that came from
// THIS car and are waiting on him show up here first (a wholesale request
// under مبيعات جملة, a retail one under مبيعات تجزئة) — the nav item for
// the section carries a dot while any are waiting. Then that car's
// movement history.
//
// Loading/offloading still can't be created from here: every one starts
// as an agent's request, and the keeper only accepts or cancels it.
export default function WarehouseCarSection({ route }) {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <BackButton href="/dashboard/warehouse" />
        <h1 className="font-display text-2xl font-bold mb-4 text-ink">{CAR_LABEL[route]}</h1>

        <SectionTitle>بانتظار تنفيذك</SectionTitle>
        <div className="mb-8">
          <WarehouseRequestQueue
            token={token}
            route={route}
            emptyText={`لا توجد طلبات من ${CAR_LABEL[route]} بانتظارك.`}
          />
        </div>

        <SectionTitle>حركات {CAR_LABEL[route]}</SectionTitle>
        <InventoryHistory token={token} fixedRoute={route} />
      </main>
    </div>
  );
}
