import { useRouter } from "next/router";
import WarehouseCarSection from "../../components/WarehouseCarSection";
import { PageLoading } from "../../components/Loading";

// The warehouse keeper's section for any van (lib/vans.js) — car1 and car2
// keep their own pages; vans added later open here.
export default function WarehouseVan() {
  const { route } = useRouter().query;
  if (!route) return <PageLoading />;
  return <WarehouseCarSection route={String(route)} />;
}
