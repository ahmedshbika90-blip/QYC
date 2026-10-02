import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import WarehouseRequestQueue from "../../components/WarehouseRequestQueue";
import { PageLoading } from "../../components/Loading";

// The warehouse keeper's queue of agent-submitted requests, every car —
// car1's own, plus car2's loading once car1 approved it (car2's returns
// need no such approval). Each one is accepted as-is or cancelled with a
// reason; nothing about the request itself can be edited here. The same
// queue, filtered by car, also appears in /warehouse/car1 and /car2.
export default function ShipmentRequestQueuePage() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <BackButton href="/dashboard/warehouse" />
        <h1 className="font-display text-2xl font-bold mb-4 text-ink">طلبات بانتظار التنفيذ</h1>
        <WarehouseRequestQueue token={token} />
      </main>
    </div>
  );
}
