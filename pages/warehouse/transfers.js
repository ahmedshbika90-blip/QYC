import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import SuccessToast from "../../components/SuccessToast";
import Icon from "../../components/Icon";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDateTime, formatQty } from "../../lib/labels";

// Warehouse keeper: transfers the supervisor created, waiting to be handed
// over. Releasing one is the moment its stock leaves the depot. The keeper
// cannot create or cancel transfers, and nothing here involves prices.
export default function WarehouseTransfers() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper"]);
  const [transfers, setTransfers] = useState([]);
  const [depot, setDepot] = useState({});
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [acting, setActing] = useState(null);

  async function load() {
    try {
      const [t, p] = await Promise.all([
        cachedGet(apiFetch, "/api/transfers/list", token),
        cachedGet(apiFetch, "/api/products/list", token),
      ]);
      setTransfers(t.transfers || []);
      setDepot(Object.fromEntries((p.products || []).map((x) => [x.id, x.stock?.depot ?? 0])));
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useLiveRefresh(token, ["transfers", "inventory"], () => {
    invalidate("/api/transfers/list");
    invalidate("/api/products/list");
    load();
  });

  async function release(t) {
    if (!window.confirm("تأكيد إخراج هذه الكميات من المخزن الآن؟")) return;
    setActing(t.id);
    setError("");
    try {
      const res = await apiFetch(`/api/transfers/${t.id}/release`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess("تم إخراج التحويل من المخزن");
      invalidate("/api/transfers/list");
      invalidate("/api/products/list");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(null);
    }
  }

  if (loading) return <PageLoading />;
  const pending = transfers.filter((t) => t.status === "pending");
  const done = transfers.filter((t) => t.status !== "pending");

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <SuccessToast message={success} onDone={() => setSuccess("")} />
      <main className="max-w-3xl mx-auto px-4 pt-4 pb-8 sm:px-8">
        <BackButton href="/dashboard/warehouse" />
        <h1 className="font-display text-2xl font-bold mt-1 mb-4 text-ink">التحويلات</h1>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <h2 className="text-sm font-bold text-amber-700 mb-2">بانتظار الإخراج</h2>
        {fetching && transfers.length === 0 ? (
          <SkeletonRows count={2} />
        ) : pending.length === 0 ? (
          <p className="text-muted text-sm bg-white rounded-2xl shadow px-4 py-5 text-center mb-6">لا توجد تحويلات بانتظارك.</p>
        ) : (
          <ul className="space-y-2 mb-6">
            {pending.map((t) => {
              const short = t.items.some((it) => (depot[it.productId] ?? 0) < it.qty);
              return (
                <li key={t.id} className="bg-white rounded-2xl shadow p-4">
                  <ul className="divide-y divide-line">
                    {t.items.map((it) => {
                      const have = depot[it.productId] ?? 0;
                      return (
                        <li key={it.productId} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="text-ink font-medium">{it.name}</span>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className={`text-xs ${have < it.qty ? "text-red-600 font-semibold" : "text-muted"}`}>
                              المخزن {formatQty(have)}
                            </span>
                            <span className="num font-bold tabular-ltr">{formatQty(it.qty)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {t.note && <p className="text-xs text-muted mt-2">ملاحظة: {t.note}</p>}
                  <p className="text-xs text-muted mt-1">من المشرف · {formatDateTime(t.createdAt)}</p>
                  {short && <p className="text-xs text-red-600 mt-2">الرصيد في المخزن لا يكفي لهذا التحويل.</p>}
                  <button
                    type="button"
                    onClick={() => release(t)}
                    disabled={acting === t.id || short}
                    className="mt-3 w-full bg-accent text-on-accent rounded-xl h-12 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {acting === t.id && <Spinner className="w-4 h-4" />}
                    أخرج من المخزن
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {done.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-muted mb-2">السابقة</h2>
            <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
              {done.map((t) => (
                <li key={t.id} className="px-4 py-3 flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-ink">{t.items.map((it) => `${it.name} ×${formatQty(it.qty)}`).join("، ")}</span>
                    <span className="block text-xs text-muted mt-0.5">
                      {formatDateTime(t.releasedAt || t.cancelledAt || t.createdAt)}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${
                      t.status === "released" ? "bg-green-100 text-green-800" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {t.status === "released" ? "تم الإخراج" : "ملغي"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
