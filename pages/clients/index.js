import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

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
    try {
      const url = q ? `/api/clients/list?q=${encodeURIComponent(q)}` : "/api/clients/list";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

  if (loading) return <p className="p-8">Loading...</p>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-semibold text-gray-800">Clients</h1>
          <Link
            href="/register-client"
            className="text-sm bg-gray-900 text-white rounded px-4 py-2"
          >
            + Add Client
          </Link>
        </div>

        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search by name, store, location, or ID..."
          className="w-full border rounded px-3 py-2 mb-6"
        />

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {fetching ? (
          <p className="text-gray-400">Loading clients...</p>
        ) : clients.length === 0 ? (
          <p className="text-gray-400">No clients found.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex justify-between items-center p-4 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {c.name}{" "}
                    <span className="font-mono text-xs text-gray-400 ml-2">#{c.id}</span>
                    {c.active === false && (
                      <span className="ml-2 text-xs text-red-500">(inactive)</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    {c.storeName} — {c.location}
                  </p>
                  {c.phone && <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>}
                </div>
                <span className="text-xs uppercase text-gray-400">{c.route}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
