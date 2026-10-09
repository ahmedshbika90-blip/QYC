import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Icon from "../../../components/Icon";
import { Spinner } from "../../../components/Loading";
import { apiFetch } from "../../../lib/apiFetch";
import { getRefMatches, setRefMatches } from "../../../lib/refSearchCache";
import { businessDay } from "../../../lib/businessDay";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, Stat, ErrorLine, LogCard, Choice, agentName, presetPeriod, STATUS, todayYmd, money, ROUTE_LABEL } from "../../../components/accounting/parts";

// Search by the LAST 4 digits of a transfer reference (رقم العملية): finds
// payments recorded on a log and on single invoices, and opens the log each
// belongs to. Runs once 4 digits are typed; results are kept in memory.
function RefSearch({ token }) {
  const [q, setQ] = useState("");
  const digits = q.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "").slice(0, 11);
  const [matches, setMatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef("");
  useEffect(() => {
    latest.current = digits;
    setError("");
    if (digits.length < 4) {
      setMatches(null);
      return;
    }
    const hit = getRefMatches(digits);
    if (hit) {
      setMatches(hit);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/accounting/find-ref?ref=${digits}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setRefMatches(digits, d.matches);
        if (latest.current === digits) setMatches(d.matches);
      } catch (err) {
        if (latest.current === digits) setError(err.message);
      } finally {
        if (latest.current === digits) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [digits, token]);
  const logOf = (m) => m.logId || (m.route && m.createdAt ? `${m.route}_${businessDay(new Date(m.createdAt))}` : null);
  return (
    <section aria-label="بحث برقم العملية" className="flex flex-col gap-3">
      <div className="relative">
        <Icon name="search" size={20} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-ink-soft pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          inputMode="numeric"
          placeholder="ابحث بآخر 4 أرقام من رقم العملية"
          className="w-full h-14 rounded-2xl border-2 border-line bg-white ps-11 pe-11 text-lg"
          aria-label="آخر 4 أرقام من رقم العملية"
        />
        {busy && <Spinner className="w-5 h-5 absolute top-1/2 -translate-y-1/2 end-3.5" />}
      </div>
      {digits.length > 0 && digits.length < 4 && <p className="text-ink-soft px-1">اكتب 4 أرقام على الأقل (<span className="num">{digits.length}</span>/4).</p>}
      <ErrorLine error={error} />
      {matches && matches.length === 0 && <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-4">لا توجد دفعة ينتهي رقم عمليتها بهذه الأرقام.</p>}
      {matches && matches.length > 0 && (
        <ul className="bg-white rounded-2xl shadow divide-y divide-line border-2 border-accent/40 overflow-hidden">
          {matches.map((m) => {
            const logId = logOf(m);
            const day = logId ? logId.split("_").pop() : null;
            return (
              <li key={`${m.bank}-${m.ref}-${m.orderId || m.logId}`}>
                <Link href={logId ? `/accounting/logs/${encodeURIComponent(logId)}` : `/accounting/invoices/${encodeURIComponent(m.orderId)}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink break-words">
                      {day ? <>سجل فواتير <span className="num" dir="ltr">{day}</span></> : "فاتورة"}
                      {m.route && <span className="text-ink-soft font-normal"> · {ROUTE_LABEL[m.route] || m.route}</span>}
                    </p>
                    <p className="text-ink-soft break-words">
                      {m.bankLabel} · <span className="num" dir="ltr">{m.ref.slice(0, -4)}<mark className="bg-amber-100 text-ink rounded px-0.5">{m.ref.slice(-4)}</mark></span>
                      {m.clientName && <> · {m.clientName}</>}
                    </p>
                  </div>
                  {m.amount != null && <span className="num font-bold text-lg text-ink">{money(m.amount)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// سجلات الفواتير — the accountant's home. Every card is one invoice log:
// one agent's invoices of one day, its value, what's paid and what's left.
// Open a card to see the clients, add the agent's payment, and record who
// paid what. Filters: period, agent, status.
const PERIODS = [
  ["week", "هذا الأسبوع"],
  ["month", "هذا الشهر"],
  ["30", "آخر 30 يومًا"],
  ["custom", "تاريخ محدد"],
];
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";

export default function Logs() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const router = useRouter();
  const [preset, setPreset] = useState("30");
  const [p, setP] = useState(() => presetPeriod("30"));
  const [route, setRoute] = useState("");
  const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (router.query.route) setRoute(String(router.query.route));
  }, [router.query.route]);
  const { data, error, reload } = useApi(token, `/api/accounting/logs?from=${p.from}&to=${p.to}${route ? `&route=${route}` : ""}`);
  const logs = useMemo(() => (data?.logs || []).filter((l) => !status || l.status === status), [data, status]);
  const agents = Object.entries(data?.agents || {});
  const activeFilters = (preset !== "30" ? 1 : 0) + (route ? 1 : 0) + (status ? 1 : 0);

  function choosePreset(k) {
    setPreset(k);
    if (k !== "custom") setP(presetPeriod(k));
  }

  if (loading) return <PageLoading />;
  const t = data?.totals;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">سجلات الفواتير</h1>
          <p className="text-ink-soft mt-1">كل سجل = فواتير مندوب واحد في يوم واحد. افتح السجل لإضافة دفعة المندوب وتسجيل ما دفعه كل عميل.</p>
        </div>

        <RefSearch token={token} />

        <div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex items-center gap-2 text-ink bg-white rounded-xl px-4 h-12 shadow-sm font-semibold"
          >
            <Icon name="filter" size={18} className="text-ink-soft" />
            تصفية
            {activeFilters > 0 && <span className="bg-accent text-on-accent text-sm rounded-full w-6 h-6 flex items-center justify-center num">{activeFilters}</span>}
            <Icon name="chevronDown" size={18} className={`text-ink-soft transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          {filtersOpen && (
            <section aria-label="التصفية" className="bg-white rounded-3xl shadow p-4 sm:p-5 mt-2 flex flex-col gap-4">
              <Choice label="الفترة" value={preset} onChange={choosePreset} options={PERIODS} />
              {preset === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
                    من
                    <input type="date" value={p.from} max={p.to} onChange={(e) => e.target.value && setP((x) => ({ ...x, from: e.target.value }))} className={field} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
                    إلى
                    <input type="date" value={p.to} min={p.from} max={todayYmd()} onChange={(e) => e.target.value && setP((x) => ({ ...x, to: e.target.value }))} className={field} />
                  </label>
                </div>
              )}
              {agents.length > 0 && (
                <Choice label="المندوب" value={route} onChange={setRoute} options={[["", "الكل"], ...agents.map(([r, people]) => [r, agentName(people, r)])]} />
              )}
              <Choice label="الحالة" value={status} onChange={setStatus} options={[["", "الكل"], ...["unpaid", "partial", "paid"].map((s) => [s, STATUS[s][0]])]} />
              {activeFilters > 0 && (
                <button type="button" onClick={() => { choosePreset("30"); setRoute(""); setStatus(""); }} className="self-start h-11 px-4 rounded-xl border-2 border-line font-semibold text-ink">
                  مسح التصفية
                </button>
              )}
            </section>
          )}
        </div>

        <ErrorLine error={error} onRetry={reload} />

        {t && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="قيمة السجلات" value={<Money value={t.total} />} sub={`${t.logs} سجل · ${t.invoices} فاتورة`} />
            <Stat label="المدفوع" value={<Money value={t.paid} />} tone="text-green-700" />
            <Stat label="المتبقي" value={<Money value={t.remaining} />} tone={t.remaining > 0 ? "text-red-700" : "text-ink"} />
          </div>
        )}

        {!data ? (
          <SkeletonRows count={6} />
        ) : logs.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-3xl shadow px-4 py-10 text-center">لا توجد سجلات مطابقة لهذه التصفية.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {logs.map((l) => <LogCard key={l.id} log={l} people={data.agents?.[l.route]} />)}
          </div>
        )}
      </main>
    </div>
  );
}
