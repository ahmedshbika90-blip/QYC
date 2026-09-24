import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { ROUTE_LABELS } from "../../lib/labels";

export default function ClientsList() {
  const { role, token, loading, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchClients(q = "") {
    setFetching(true);
    setError("");
    try {
      const url = q ? `/api/clients/list?q=${encodeURIComponent(q)}` : "/api/clients/list";
      const res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClients(data.clients);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  function handleSearchChange(e) {
    const value = e.target.value;
    setSearch(value);
    fetchClients(value);
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="flex justify-between items-center mb-4 gap-3">
          <h1 className="text-xl font-semibold text-gray-800">العملاء</h1>
          <Link
            href="/register-client"
            className="text-sm bg-gray-900 text-white rounded-lg px-4 min-h-[44px] flex items-center active:bg-gray-700 shrink-0"
          >
            + إضافة عميل
          </Link>
        </div>

        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="ابحث بالاسم أو المتجر أو الموقع أو الرقم..."
          className="w-full border rounded-lg px-3 h-12 text-base mb-6"
        />

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={() => fetchClients(search)} className="underline shrink-0">
              إعادة المحاولة
            </button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : clients.length === 0 ? (
          <p className="text-gray-400">لا يوجد عملاء.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex justify-between items-center p-4 min-h-[64px] active:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {c.name}{" "}
                    <span className="font-mono text-xs text-gray-400 ms-2 tabular-ltr">#{c.id}</span>
                    {c.active === false && (
                      <span className="ms-2 text-xs text-red-500">(غير نشط)</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    {c.storeName} — {c.location}
                  </p>
                  {c.phone && <p className="text-xs text-gray-400 mt-0.5 tabular-ltr text-start">{c.phone}</p>}
                </div>
                <span className="text-xs text-gray-400 shrink-0">{ROUTE_LABELS[c.route]}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
