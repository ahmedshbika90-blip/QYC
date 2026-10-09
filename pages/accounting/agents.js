import { useEffect } from "react";
import { useRouter } from "next/router";
import { PageLoading } from "../../components/Loading";

// Agents are a filter on the invoice logs now.
export default function AgentsMoved() {
  const router = useRouter();
  useEffect(() => {
    const r = router.query.route;
    router.replace(r ? `/accounting/logs?route=${encodeURIComponent(r)}` : "/accounting/logs");
  }, [router]);
  return <PageLoading />;
}
