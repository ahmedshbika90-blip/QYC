import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import ShipmentRequestsPanel from "../components/ShipmentRequestsPanel";
import { PageLoading } from "../components/Loading";

// Shipping documents for the agent: "طلب جديد" and "طلباتي" (which also
// holds, for car1, the retail agent's requests waiting for approval).
// The archive tab is gone: unconfirmed loading receipts live in the home
// screen's pending box, and every completed request in "طلباتي" opens its
// own page, so nothing that used to be in the archive is unreachable.
export default function Documents() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <BackButton />
        <h1 className="font-display text-2xl font-bold mb-4 mt-1 text-ink">المستندات</h1>
        <ShipmentRequestsPanel role={role} token={token} />
      </main>
    </div>
  );
}
