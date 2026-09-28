import { useEffect, useState } from "react";
import InventoryDocCard from "./InventoryDocCard";
import FilterPanel from "./FilterPanel";
import { SkeletonRows, Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";

// Filterable, date-windowed, paginated inventory history. Used by several
// pages with different fixed scopes:
//   fixedRoute  — lock to one car (warehouse car sections)
//   fixedType   — lock to one document type (warehouse inventory section)
//   excludePending — hide pending docs (agents' Documents: pending ones
//                    live on the dashboard until confirmed)
// Filters the user can still change are shown; locked ones are hidden.
// `reloadKey` — bump it after creating a document to refresh the list.
export default function InventoryHistory({
  token,
  fixedRoute,
  fixedType,
  excludePending = false,
  showRouteFilter = true,
  reloadKey = 0,
  emptyText = "لا توجد حركات في هذه الفترة.",
}) {
  const [docs, setDocs] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const type = fixedType || typeFilter;
  const route = fixedRoute || routeFilter;

  function url(cursor) {
    const p = new URLSearchParams();
    if (dateFrom) p.set("from", dateFrom);
    if (dateTo) p.set("to", dateTo);
    if (type) p.set("type", type);
    if (route) p.set("route", route);
    if (statusFilter) p.set("status", statusFilter);
    if (excludePending) p.set("excludePending", "1");
    if (cursor) p.set("cursor", cursor);
    return `/api/inventory/list?${p.toString()}`;
  }

  useLiveRefresh(token, ["inventory"], load);

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dateFrom, dateTo, type, route, statusFilter, reloadKey]);

  async function load() {
    setFetching(true);
    setError("");
    try {
      const data = await cachedGet(apiFetch, url(), token);
      setDocs(data.docs);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await cachedGet(apiFetch, url(nextCursor), token);
      setDocs((prev) => [...prev, ...data.docs]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const selectClass = "border rounded-lg px-3 h-11 text-base";
  const extraActive = [!fixedType && typeFilter, !fixedRoute && routeFilter, statusFilter].filter(Boolean).length;

  return (
    <div>
      <FilterPanel
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        extraActiveCount={extraActive}
      >
        {!fixedType && (
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectClass}>
            <option value="">كل الأنواع</option>
            <option value="received">استلام بضاعة</option>
            <option value="loading">تحميل</option>
            <option value="offloading">تفريغ</option>
          </select>
        )}
        {!fixedRoute && showRouteFilter && (
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} className={selectClass}>
            <option value="">كل السيارات</option>
            <option value="car1">السيارة ١</option>
            <option value="car2">السيارة ٢</option>
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">كل الحالات</option>
          {!excludePending && <option value="pending">بانتظار التأكيد</option>}
          <option value="confirmed">مؤكدة</option>
          <option value="disputed">متنازع عليها</option>
          <option value="rejected">مرفوضة</option>
          <option value="cancelled">ملغاة</option>
        </select>
      </FilterPanel>

      {!dateFrom && <p className="text-xs text-gray-400 mb-3">يعرض آخر ٣٠ يومًا — حدد "من تاريخ" لفترة أقدم.</p>}

      {error && (
        <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
          <span>{error}</span>
          <button onClick={load} className="underline shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {fetching ? (
        <SkeletonRows count={4} />
      ) : docs.length === 0 ? (
        <p className="text-gray-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          <div className="bg-white rounded-lg shadow divide-y">
            {docs.map((d) => (
              <InventoryDocCard key={d.id} doc={d} />
            ))}
          </div>
          {nextCursor && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full bg-white rounded-lg shadow text-sm text-gray-600 h-11 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingMore && <Spinner className="w-4 h-4" />}
              {loadingMore ? "جارٍ التحميل..." : "تحميل المزيد"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
