import { useEffect, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import FilterPanel from "../../components/FilterPanel";
import PeriodTabs, { periodStartISO } from "../../components/PeriodTabs";
import RequestCard from "../../components/RequestCard";
import ShipmentRequestsPanel from "../../components/ShipmentRequestsPanel";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet, invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";

const SUP_TABS = [
  ["pending", "بانتظار القرار"],
  ["approved", "الموافق عليها"],
  ["rejected", "المرفوضة"],
];
const AGENT_ORDER_TABS = [
  ["pending", "بانتظار القرار"],
  ["approved", "تمت الموافقة"],
  ["rejected", "مرفوضة"],
];

// One page, two very different audiences:
//  - Supervisor: reviews change requests (invoice edit/cancel) from
//    agents — pending ones to decide on, plus history.
//  - Agent (car1/car2): "الطلبات" — everything THEY might need to check
//    or act on: their own change requests to the supervisor, and loading/
//    offloading requests (car1 additionally approves/rejects car2's).
// Both sets of hooks are declared unconditionally (rules of hooks), each
// gated internally by role so the wrong one never actually fetches.
export default function RequestsPage() {
  const { role, token, loading, logout } = useAuth(["supervisor", "agent_car1", "agent_car2"]);
  const isSupervisor = role === "supervisor";
  const isAgent = role === "agent_car1" || role === "agent_car2";

  // ---- Supervisor: change-request review ----
  const [supTab, setSupTab] = useState("pending");
  const [supRequests, setSupRequests] = useState([]);
  const [supNextCursor, setSupNextCursor] = useState(null);
  const [supFetching, setSupFetching] = useState(true);
  const [supLoadingMore, setSupLoadingMore] = useState(false);
  const [supError, setSupError] = useState("");
  const [supRoute, setSupRoute] = useState("");
  const [supPeriod, setSupPeriod] = useState(7);
  const [supDateFrom, setSupDateFrom] = useState("");
  const [supDateTo, setSupDateTo] = useState("");

  function supUrl(cursor) {
    const p = new URLSearchParams();
    p.set("status", supTab);
    if (supRoute) p.set("route", supRoute);
    if (supTab !== "pending") {
      p.set("from", supDateFrom || periodStartISO(supPeriod));
      if (supDateTo) p.set("to", supDateTo);
      if (cursor) p.set("cursor", cursor);
    }
    return `/api/requests/list?${p.toString()}`;
  }

  async function supLoad() {
    setSupFetching(true);
    setSupError("");
    try {
      const data = await cachedGet(apiFetch, supUrl(), token);
      setSupRequests(data.requests);
      setSupNextCursor(data.nextCursor);
    } catch (err) {
      setSupError(err.message);
    } finally {
      setSupFetching(false);
    }
  }

  async function supLoadMore() {
    setSupLoadingMore(true);
    try {
      const data = await cachedGet(apiFetch, supUrl(supNextCursor), token);
      setSupRequests((prev) => [...prev, ...data.requests]);
      setSupNextCursor(data.nextCursor);
    } catch (err) {
      setSupError(err.message);
    } finally {
      setSupLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!token || !isSupervisor) return;
    supLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSupervisor, supTab, supRoute, supPeriod, supDateFrom, supDateTo]);

  useLiveRefresh(token, isSupervisor ? ["requests"] : [], () => {
    invalidate("/api/requests");
    supLoad();
  });

  // ---- Agent: their own order change-requests ----
  const [mainTab, setMainTab] = useState("orders"); // "orders" | "shipments"
  const [agentOrderTab, setAgentOrderTab] = useState("pending");
  const [orderRequests, setOrderRequests] = useState([]);
  const [orderFetching, setOrderFetching] = useState(true);
  const [orderError, setOrderError] = useState("");

  async function loadOrderRequests() {
    setOrderFetching(true);
    setOrderError("");
    try {
      const res = await apiFetch(`/api/requests/list?status=${agentOrderTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrderRequests(data.requests);
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setOrderFetching(false);
    }
  }

  useEffect(() => {
    if (!token || !isAgent) return;
    loadOrderRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAgent, agentOrderTab]);

  useLiveRefresh(token, isAgent ? ["requests"] : [], () => {
    invalidate("/api/requests");
    loadOrderRequests();
  });

  if (loading) return <PageLoading />;

  if (isSupervisor) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <div className="max-w-3xl mx-auto p-4 sm:p-8">
          <h1 className="text-xl font-semibold mb-3 text-gray-800">طلبات التعديل والإلغاء</h1>

          <div className="flex gap-1 mb-3 overflow-x-auto">
            {SUP_TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSupTab(key)}
                className={`whitespace-nowrap min-h-[40px] px-3 rounded-lg text-sm ${
                  supTab === key ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {supTab !== "pending" && (
            <PeriodTabs
              value={supDateFrom || supDateTo ? null : supPeriod}
              onChange={(d) => {
                setSupPeriod(d);
                setSupDateFrom("");
                setSupDateTo("");
              }}
            />
          )}

          <FilterPanel
            {...(supTab !== "pending"
              ? { dateFrom: supDateFrom, onDateFromChange: setSupDateFrom, dateTo: supDateTo, onDateToChange: setSupDateTo }
              : {})}
            extraActiveCount={supRoute ? 1 : 0}
          >
            <select
              value={supRoute}
              onChange={(e) => setSupRoute(e.target.value)}
              className="border rounded-lg px-3 h-11 text-base"
            >
              <option value="">كل السيارات</option>
              <option value="car1">مبيعات جملة</option>
              <option value="car2">مبيعات تجزئة</option>
            </select>
          </FilterPanel>

          {supError && (
            <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
              <span>{supError}</span>
              <button onClick={supLoad} className="underline shrink-0">إعادة المحاولة</button>
            </div>
          )}

          {supFetching ? (
            <SkeletonRows count={4} />
          ) : supRequests.length === 0 ? (
            <p className="text-gray-400">
              {supTab === "pending" ? "لا توجد طلبات بانتظار قرارك." : "لا توجد طلبات في هذه الفترة."}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="bg-white rounded-lg shadow divide-y">
                {supRequests.map((r) => (
                  <RequestCard key={r.id} request={r} />
                ))}
              </div>
              {supNextCursor && (
                <button
                  onClick={supLoadMore}
                  disabled={supLoadingMore}
                  className="w-full bg-white rounded-lg shadow text-sm text-gray-600 h-11 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {supLoadingMore && <Spinner className="w-4 h-4" />}
                  {supLoadingMore ? "جارٍ التحميل..." : "تحميل المزيد"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Agent view: unified "الطلبات" — order change requests + loading/offloading.
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-3 text-gray-800">الطلبات</h1>

        <div className="flex gap-1 mb-4 overflow-x-auto">
          {[
            ["orders", "طلبات الفاتورة"],
            ["shipments", "التحميل والتفريغ"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              className={`whitespace-nowrap min-h-[40px] px-3 rounded-lg text-sm ${
                mainTab === key ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mainTab === "shipments" ? (
          <ShipmentRequestsPanel role={role} token={token} />
        ) : (
          <>
            <div className="flex gap-1 mb-3 overflow-x-auto">
              {AGENT_ORDER_TABS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAgentOrderTab(key)}
                  className={`whitespace-nowrap min-h-[40px] px-3 rounded-lg text-sm ${
                    agentOrderTab === key ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {orderError && <p className="text-red-600 text-sm mb-4">{orderError}</p>}

            {orderFetching ? (
              <SkeletonRows count={4} />
            ) : orderRequests.length === 0 ? (
              <p className="text-gray-400">
                {agentOrderTab === "pending" ? "لا توجد طلبات بانتظار قرار المشرف." : "لا توجد طلبات بهذه الحالة."}
              </p>
            ) : (
              <div className="bg-white rounded-lg shadow divide-y">
                {orderRequests.map((r) => (
                  <RequestCard key={r.id} request={r} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
