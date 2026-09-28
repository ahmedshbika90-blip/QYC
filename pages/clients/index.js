import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import FilterPanel from "../../components/FilterPanel";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { getClients } from "../../lib/clientsStore";

// Search + filters all run in the browser on the version-cached client
// list (see lib/clientsStore.js) — typing, filtering, or switching filters
// costs zero Firestore reads.
export default function ClientsList() {
  const { user, role, token, loading, logout } = useAuth(["agent_car1", "agent_car2", "supervisor"]);
  const [clients, setClients] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [storeClass, setStoreClass] = useState("");
  const [routeFilter, setRouteFilter] = useState("");

  useEffect(() => {
    if (!token || !user) return;
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  async function fetchClients() {
    setFetching(true);
    setError("");
    try {
      setClients(await getClients(apiFetch, token, user.uid));
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (s) {
        const hay = `${c.id} ${c.name || ""} ${c.storeName || ""} ${c.phone || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (nameQuery && !(c.name || "").toLowerCase().includes(nameQuery.toLowerCase())) return false;
      if (locationQuery && !(c.location || "").toLowerCase().includes(locationQuery.toLowerCase()))
        return false;
      if (storeClass && c.storeClass !== storeClass) return false;
      if (routeFilter && c.route !== routeFilter) return false;
      return true;
    });
  }, [clients, search, nameQuery, locationQuery, storeClass, routeFilter]);

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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو المتجر أو الرقم أو الهاتف..."
          className="w-full border rounded-lg px-3 h-12 text-base mb-3"
        />

        <FilterPanel
          nameQuery={nameQuery}
          onNameChange={setNameQuery}
          locationQuery={locationQuery}
          onLocationChange={setLocationQuery}
          storeClass={storeClass}
          onStoreClassChange={setStoreClass}
          extraActiveCount={routeFilter ? 1 : 0}
        >
          {role === "supervisor" && (
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="border rounded-lg px-3 h-11 text-base"
            >
              <option value="">كل المسارات</option>
              <option value="car1">السيارة ١</option>
              <option value="car2">السيارة ٢</option>
            </select>
          )}
        </FilterPanel>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchClients} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {!fetching && (
          <p className="text-xs text-gray-400 mb-2">{visible.length} عميل</p>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : visible.length === 0 ? (
          <p className="text-gray-400">لا يوجد عملاء مطابقون.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {visible.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex justify-between items-center p-4 min-h-[64px] active:bg-gray-50 gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {c.name}
                    <span className="font-mono text-xs text-gray-400 ms-2 tabular-ltr">#{c.id}</span>
                    {c.active === false && <span className="ms-2 text-xs text-red-500">(غير نشط)</span>}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {c.storeName} — {c.location}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.storeClass && (
                    <span className="text-xs font-medium bg-gray-100 text-gray-700 rounded px-2 py-0.5">
                      {c.storeClass}
                    </span>
                  )}
                  {role === "supervisor" && (
                    <span className="text-xs text-gray-400">{c.route === "car1" ? "السيارة ١" : "السيارة ٢"}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
