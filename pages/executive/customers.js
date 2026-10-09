import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import Icon from "../../components/Icon";
import FilterChips from "../../components/FilterChips";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { getClients } from "../../lib/clientsStore";
import { formatDate, ROUTE_LABELS_SHORT, STORE_CLASSES } from "../../lib/labels";
import { ROUTES } from "../../lib/roles";
import { vanFilterOptions, matchesVanFilter } from "../../lib/vanNames";

// The full customer database, read-only, for the executive. Kept off the
// dashboard on purpose; the list is cached on the device and only
// re-downloaded when a client is added or edited (lib/clientsStore.js),
// and it's shown 50 at a time so a long list never overwhelms the page.
const PAGE = 50;

export default function ExecutiveCustomers() {
  const { user, role, token, loading, logout } = useAuth(["executive"]);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [cls, setCls] = useState("");
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (!token || !user) return;
    getClients(apiFetch, token, user.uid)
      .then(setClients)
      .catch((e) => setError(e.message));
  }, [token, user]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (clients || []).filter((c) => {
      if (route && !matchesVanFilter(route, c.route)) return false;
      if (cls && c.storeClass !== cls) return false;
      if (status === "active" && c.active === false) return false;
      if (status === "inactive" && c.active !== false) return false;
      if (!s) return true;
      return [c.name, c.storeName, c.deliveryRoute, c.location, c.phone, c.id].some((v) => String(v || "").toLowerCase().includes(s));
    });
  }, [clients, q, route, cls, status]);
  useEffect(() => setShown(PAGE), [q, route, cls, status]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-4xl mx-auto px-4 pt-5 pb-8 sm:px-8 flex flex-col gap-4">
        <BackButton href="/executive?tab=customers" />
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">قاعدة العملاء</h1>
          <p className="text-sm text-muted mt-1">
            {clients ? <><span className="num">{rows.length}</span> من <span className="num">{clients.length}</span> عميل</> : " "} — للعرض فقط.
          </p>
        </div>

        <div className="relative">
          <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو المتجر أو المسار أو الموقع أو الهاتف أو الرقم..." className="h-12 w-full rounded-xl border border-line bg-white ps-10 pe-3 text-base" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterChips label="نوع البيع" value={route} onChange={setRoute} options={vanFilterOptions()} className="sm:col-span-1" />
          <FilterChips label="التصنيف" value={cls} onChange={setCls} options={STORE_CLASSES.map((c) => [c, c])} className="sm:col-span-1" />
          <FilterChips label="الحالة" value={status} onChange={setStatus} options={[["active", "نشط"], ["inactive", "غير نشط"]]} className="sm:col-span-1" />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!clients ? (
          !error && <SkeletonRows count={8} />
        ) : rows.length === 0 ? (
          <p className="text-muted">لا يوجد عملاء مطابقون.</p>
        ) : (
          <>
            <ul className="bg-white rounded-2xl shadow divide-y divide-line">
              {rows.slice(0, shown).map((c) => (
                <li key={c.id} className="px-4 py-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {c.name} <span className="text-xs text-muted num">#{c.id}</span>
                      {c.active === false && <span className="ms-2 text-xs text-amber-700">غير نشط</span>}
                    </p>
                    <p className="text-sm text-muted mt-0.5 truncate">{[c.storeName, c.deliveryRoute, c.location].filter(Boolean).join(" · ")}</p>
                    {c.phone && <p className="text-xs text-muted mt-0.5 num" dir="ltr" style={{ textAlign: "start" }}>{c.phone}</p>}
                  </div>
                  <div className="text-end shrink-0 text-xs text-muted flex flex-col items-end gap-1">
                    <span className="font-semibold text-ink-soft">{ROUTE_LABELS_SHORT[c.route] || c.route}</span>
                    {c.storeClass && <span>تصنيف <span className="num">{c.storeClass}</span></span>}
                    {c.createdAt && <span>{formatDate(c.createdAt)}</span>}
                  </div>
                </li>
              ))}
            </ul>
            {shown < rows.length && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="w-full bg-white rounded-xl shadow h-11 text-sm text-ink-soft">
                عرض المزيد (<span className="num">{rows.length - shown}</span>)
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
