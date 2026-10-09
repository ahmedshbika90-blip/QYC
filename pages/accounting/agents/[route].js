import { useEffect } from "react";
import { useRouter } from "next/router";
import { PageLoading } from "../../../components/Loading";

// An agent's logs are the logs page filtered to that agent.
export default function AgentLogs() {
  const router = useRouter();
  useEffect(() => {
    if (router.query.route) router.replace(`/accounting/logs?route=${encodeURIComponent(router.query.route)}`);
  }, [router]);
  return <PageLoading />;
}
