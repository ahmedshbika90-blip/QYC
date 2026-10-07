import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import FilterPanel from "../../components/FilterPanel";
import { routesFromClients } from "../../components/DeliveryRoutePicker";
import FilterChips from "../../components/FilterChips";
import Icon from "../../components/Icon";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { getClients } from "../../lib/clientsStore";

// Search + filters all run in the browser on the version-cached client
// list (see lib/clientsStore.js) — typing, filtering, or switching filters
// costs zero Firestore reads.
export default function ClientsList() {
  const { user, role, token, loading, logout } = useAuth(["agent_car1", "agent_car2", "manager"]);
  const [clients, setClients] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [deliveryRoute, setDeliveryRoute] = useState(""); // المسار
  const [locationQuery, setLocationQuery] = useState("");
  const [storeClass, setStoreClass] = useState("");
  const [routeFilter, setRouteFilter] = useState("");

  // Any filter active? Used to offer a single "clear everything" action,
  // so nobody is left staring at a short list wondering why.
  const activeFilters = [search, nameQuery, deliveryRoute, locationQuery, storeClass, routeFilter].filter(Boolean).length;
  function clearFilters() {
    setSearch("");
    setNameQuery("");
    setDeliveryRoute("");
    setLocationQuery("");
    setStoreClass("");
    setRouteFilter("");
  }

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
      if (deliveryRoute && (c.deliveryRoute || "") !== deliveryRoute) return false;
      if (locationQuery && !(c.location || "").toLowerCase().includes(locationQuery.toLowerCase()))
        return false;
      if (storeClass && c.storeClass !== storeClass) return false;
      if (routeFilter && c.route !== routeFilter) return false;
      return true;
    });
  }, [clients, search, nameQuery, deliveryRoute, locationQuery, storeClass, routeFilter]);
  const routeOptions = useMemo(() => routesFromClients(clients), [clients]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="flex justify-between items-center mb-4 gap-3">
          <h1 className="font-display text-2xl font-bold text-ink">العملاء</h1>
          <Link
            href="/register-client"
            className="inline-flex items-center gap-2 h-12 px-4 rounded-2xl bg-accent text-on-accent text-[15px] font-bold shadow-sm hover:bg-accent-strong active:bg-accent-strong shrink-0"
          >
            <Icon name="userPlus" size={20} />
            إضافة عميل
          </Link>
        </div>

        <div className="relative mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو المتجر أو الرقم أو الهاتف..."
            className="w-full border border-line rounded-xl ps-3 pe-11 h-12 text-base"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="مسح البحث"
              className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-gray-400 hover:text-ink"
            >
              <Icon name="x" size={18} />
            </button>
          )}
        </div>

        <FilterPanel
          nameQuery={nameQuery}
          onNameChange={setNameQuery}
          deliveryRoute={deliveryRoute}
          onDeliveryRouteChange={setDeliveryRoute}
          deliveryRouteOptions={routeOptions}
          locationQuery={locationQuery}
          onLocationChange={setLocationQuery}
          storeClass={storeClass}
          onStoreClassChange={setStoreClass}
          extraActiveCount={routeFilter ? 1 : 0}
        >
          {role === "manager" && (
            <FilterChips label="نوع البيع" value={routeFilter} onChange={setRouteFilter} options={[["car1", "مبيعات جملة"], ["car2", "مبيعات تجزئة"]]} />
          )}
        </FilterPanel>

        {activeFilters > 0 && (
          <div className="flex items-center justify-between gap-3 mt-2 mb-1 text-sm">
            <span className="text-muted">
              <span className="num font-semibold text-ink">{visible.length}</span> من{" "}
              <span className="num">{clients.length}</span> عميل
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-2 text-ink font-semibold"
            >
              <Icon name="x" size={15} />
              إلغاء الفلتر
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4 flex items-center justify-between gap-2">
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
                    {c.storeName} — {c.deliveryRoute ? `${c.deliveryRoute} · ` : ""}{c.location}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.storeClass && (
                    <span className="text-xs font-medium bg-gray-100 text-gray-700 rounded px-2 py-0.5">
                      {c.storeClass}
                    </span>
                  )}
                  {role === "manager" && (
                    <span className="text-xs text-gray-400">{c.route === "car1" ? "مبيعات جملة" : "مبيعات تجزئة"}</span>
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
