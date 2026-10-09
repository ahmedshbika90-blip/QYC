import { useAuth } from "../lib/useAuth";
import Nav from "./Nav";
import BackButton from "./BackButton";
import InventoryHistory from "./InventoryHistory";
import WarehouseRequestQueue from "./WarehouseRequestQueue";
import { PageLoading } from "./Loading";
import { SectionTitle } from "./Today";

import { vanName, vanShort, vanTypeOfId } from "../lib/vanNames";
import { useVans } from "../lib/useVans";
const CAR_LABEL = new Proxy({}, { get: (_, id) => vanName(String(id)) }); // any van (lib/vanNames.js)

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
        <h1 className="font-display text-2xl font-bold text-ink">{CAR_LABEL[route]}</h1>
        <VanPeople route={route} token={token} />

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

// Who works on this van (supervisor first), under its name.
function VanPeople({ route, token }) {
  const vans = useVans(token);
  const v = vans.find((x) => x.id === route);
  if (!v?.people?.length) return <div className="mb-4" />;
  return (
    <p className="text-ink-soft mb-4 break-words">
      {v.people.map((p, i) => (
        <span key={p.uid}>
          {i > 0 && "، "}
          {p.name}
          {p.supervisor && " (مشرف)"}
        </span>
      ))}
    </p>
  );
}
