import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import FilterPanel from "../../components/FilterPanel";
import PeriodTabs, { periodStartISO } from "../../components/PeriodTabs";
import RequestCard from "../../components/RequestCard";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";

const TABS = [
  ["pending", "بانتظار القرار"],
  ["approved", "الموافق عليها"],
  ["rejected", "المرفوضة"],
];

// Supervisor's change requests: pending ones to decide on, and the history
// of approved/rejected ones, filterable by car and decision date.
export default function RequestsPage() {
  const { role, token, loading, logout } = useAuth(["supervisor"]);
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [route, setRoute] = useState("");
  const [period, setPeriod] = useState(7);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function url(cursor) {
    const p = new URLSearchParams();
    p.set("status", tab);
    if (route) p.set("route", route);
    if (tab !== "pending") {
      p.set("from", dateFrom || periodStartISO(period));
      if (dateTo) p.set("to", dateTo);
      if (cursor) p.set("cursor", cursor);
    }
    return `/api/requests/list?${p.toString()}`;
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, route, period, dateFrom, dateTo]);

  async function load() {
    setFetching(true);
    setError("");
    try {
      const data = await cachedGet(apiFetch, url(), token);
      setRequests(data.requests);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await cachedGet(apiFetch, url(nextCursor), token);
      setRequests((prev) => [...prev, ...data.requests]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">طلبات التعديل والإلغاء</h1>

        <div className="flex gap-1 mb-3 overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap min-h-[40px] px-3 rounded-lg text-sm ${
                tab === key ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== "pending" && (
          <PeriodTabs
            value={dateFrom || dateTo ? null : period}
            onChange={(d) => {
              setPeriod(d);
              setDateFrom("");
              setDateTo("");
            }}
          />
        )}

        <FilterPanel
          {...(tab !== "pending"
            ? { dateFrom, onDateFromChange: setDateFrom, dateTo, onDateToChange: setDateTo }
            : {})}
          extraActiveCount={route ? 1 : 0}
        >
          <select value={route} onChange={(e) => setRoute(e.target.value)} className="border rounded-lg px-3 h-11 text-base">
            <option value="">كل السيارات</option>
            <option value="car1">السيارة ١</option>
            <option value="car2">السيارة ٢</option>
          </select>
        </FilterPanel>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={load} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : requests.length === 0 ? (
          <p className="text-gray-400">{tab === "pending" ? "لا توجد طلبات بانتظار قرارك." : "لا توجد طلبات في هذه الفترة."}</p>
        ) : (
          <div className="space-y-2">
            <div className="bg-white rounded-lg shadow divide-y">
              {requests.map((r) => (
                <RequestCard key={r.id} request={r} />
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
    </div>
  );
}
