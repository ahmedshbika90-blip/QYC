import { useEffect } from "react";
import { useRouter } from "next/router";
import { PageLoading } from "../../../components/Loading";

// The invoice list and the agents page are covered by the invoice logs
// (search by the last 4 digits, filter by agent there).
export default function InvoicesMoved() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/accounting/logs");
  }, [router]);
  return <PageLoading />;
}
