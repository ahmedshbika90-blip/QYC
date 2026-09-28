import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import InventoryDocCard from "../../components/InventoryDocCard";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";

// The supervisor doesn't create inventory here — only the warehouse
// keeper logs what physically came in (from /dashboard/warehouse). This
// page is purely oversight: the full history of every movement, and
// tapping a pending "goods received" card is where approval happens
// (see /inventory/[id]).
export default function InventoryPage() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
  const [docs, setDocs] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchDocs() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch("/api/inventory/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDocs(data.docs);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  const pendingCount = docs.filter((d) => d.status === "pending").length;

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-1 text-gray-800">المخزون</h1>
        <p className="text-sm text-gray-400 mb-6">
          {pendingCount > 0
            ? `${pendingCount} بانتظار الاعتماد — اضغط على أي منها لمراجعتها.`
            : "سجل جميع حركات المخزون: استلام، تحميل، وتفريغ."}
        </p>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchDocs} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : docs.length === 0 ? (
          <p className="text-gray-400">لا توجد حركات بعد.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {docs.map((d) => (
              <InventoryDocCard key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
