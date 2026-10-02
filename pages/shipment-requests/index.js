import { useEffect } from "react";
import { useRouter } from "next/router";
import { PageLoading } from "../../components/Loading";

// Shipping orders and cargo returns live in المستندات → شحن
// (components/ShipmentRequestsPanel.js). This old standalone page had
// drifted from that one — it alone had the car-stock limit for returns,
// but nothing in the app linked here, so agents never saw it. Kept only
// so an old bookmark lands in the right place.
export default function ShipmentRequestsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/documents");
  }, [router]);
  return <PageLoading />;
}
