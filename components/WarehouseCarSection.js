import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import Nav from "./Nav";
import InventoryHistory from "./InventoryHistory";
import { PageLoading } from "./Loading";

const CAR_LABEL = { car1: "مبيعات جملة", car2: "مبيعات تجزئة" };

// One car's section for the warehouse keeper: movement HISTORY only.
// Loading/offloading can no longer be created from here directly — every
// one of them must start as an agent's shipment request (see
// /warehouse/shipment-requests, the fulfillment queue) and, for car2,
// also pass car1's approval first. This page is read-only by design so
// that rule can't quietly be routed around.
export default function WarehouseCarSection({ route }) {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-4 text-gray-800">{CAR_LABEL[route]}</h1>

        <Link
          href="/warehouse/shipment-requests"
          className="block bg-accent text-on-accent rounded-lg p-4 mb-6 active:bg-accent-strong"
        >
          <p className="font-medium">تنفيذ طلب بانتظارك ←</p>
          <p className="text-xs text-gray-300 mt-0.5">
            كل أمر شحن أو مرتجع بضاعة يبدأ بطلب من المندوب — لا يمكن إنشاؤه من هنا مباشرة. أمر الشحن يحتاج
            تأكيد المندوب لاحقًا؛ مرتجع البضاعة يُستلَم مباشرة عند تنفيذه.
          </p>
        </Link>

        <h2 className="font-medium text-gray-800 mb-3">حركات {CAR_LABEL[route]}</h2>
        <InventoryHistory token={token} fixedRoute={route} />
      </div>
    </div>
  );
}
