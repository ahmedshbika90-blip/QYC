import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import Icon from "../../../components/Icon";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { normalizeAr } from "../../../lib/arabicSearch";
import { useApi, Money, ErrorLine, Choice, ROUTE_LABEL } from "../../../components/accounting/parts";

// العملاء — who owes what, and for how long. Ageing by invoice age:
// 0–30 / 31–60 / 61–90 / over 90 days. Tap a client for the statement.
const BUCKETS = [
  ["0-30", "حتى 30 يومًا", "bg-green-500"],
  ["31-60", "31–60 يومًا", "bg-amber-400"],
  ["61-90", "61–90 يومًا", "bg-orange-500"],
  ["90+", "أكثر من 90 يومًا", "bg-red-600"],
];

function AgeBar({ ageing, total }) {
  if (!total) return null;
  return (
    <div className="h-3 rounded-full bg-surface-2 overflow-hidden flex" role="img" aria-label="أعمار الديون">
      {BUCKETS.map(([k, , color]) => (ageing[k] > 0 ? <span key={k} className={color} style={{ width: `${(ageing[k] / total) * 100}%` }} /> : null))}
    </div>
  );
}

export default function Clients() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [age, setAge] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data, error, reload } = useApi(token, `/api/accounting/clients?${route ? `route=${route}&` : ""}${showAll ? "all=1" : ""}`);
  const rows = useMemo(() => {
    const s = normalizeAr(q);
    return (data?.clients || []).filter((c) => {
      if (age && !(c.ageing[age] > 0)) return false;
      if (!s) return true;
      return [c.name, c.storeName, c.id, c.phone, c.deliveryRoute].some((v) => normalizeAr(v).includes(s));
    });
  }, [data, q, age]);
  const activeFilters = (route ? 1 : 0) + (age ? 1 : 0) + (showAll ? 1 : 0);
  if (loading) return <PageLoading />;
  const t = data?.totals;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">العملاء</h1>
          <p className="text-ink-soft mt-1">ما على كل عميل ومنذ متى. افتح العميل لكشف الحساب.</p>
        </div>
        <ErrorLine error={error} onRetry={reload} />
        {t && (
          <section className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-ink-soft">المستحق على العملاء</p>
                <p className="font-display text-3xl font-bold text-red-700"><Money value={t.balance} /></p>
                <p className="text-ink-soft"><span className="num">{t.clients}</span> عميل عليهم مبالغ</p>
              </div>
              {t.credit > 0 && (
                <div className="text-end">
                  <p className="text-ink-soft">مدفوع زيادة (رصيد للعملاء)</p>
                  <p className="text-xl font-bold text-blue-700"><Money value={t.credit} /></p>
                </div>
              )}
            </div>
            <AgeBar ageing={t.ageing} total={t.balance} />
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
              {BUCKETS.map(([k, label, color]) => (
                <button key={k} type="button" onClick={() => setAge(age === k ? "" : k)} aria-pressed={age === k} className={`rounded-2xl border-2 p-3 text-start ${age === k ? "border-accent bg-accent-soft" : "border-line"}`}>
                  <span className="flex items-center gap-2 text-ink-soft"><span className={`w-3 h-3 rounded-full ${color}`} />{label}</span>
                  <span className="block text-lg font-bold text-ink mt-1"><Money value={t.ageing[k]} /></span>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="relative">
          <Icon name="search" size={20} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-ink-soft pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العميل أو المتجر أو الرقم أو الهاتف" className="w-full h-14 rounded-2xl border-2 border-line bg-white ps-11 pe-3 text-lg" />
        </div>
        <div>
          <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className="flex items-center gap-2 text-ink bg-white rounded-xl px-4 h-12 shadow-sm font-semibold">
            <Icon name="filter" size={18} className="text-ink-soft" />
            تصفية
            {activeFilters > 0 && <span className="bg-accent text-on-accent text-sm rounded-full w-6 h-6 flex items-center justify-center num">{activeFilters}</span>}
            <Icon name="chevronDown" size={18} className={`text-ink-soft transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          {filtersOpen && (
            <section className="bg-white rounded-3xl shadow p-4 sm:p-5 mt-2 flex flex-col gap-4">
              <Choice label="المندوب" value={route} onChange={setRoute} options={[["", "الكل"], ["car1", ROUTE_LABEL.car1], ["car2", ROUTE_LABEL.car2]]} />
              <Choice label="عمر الدين" value={age} onChange={setAge} options={[["", "الكل"], ...BUCKETS.map(([k, l]) => [k, l])]} />
              <Choice label="العملاء" value={showAll ? "all" : ""} onChange={(v) => setShowAll(v === "all")} options={[["", "عليهم مبالغ فقط"], ["all", "كل العملاء"]]} />
            </section>
          )}
        </div>
        {!data ? (
          <SkeletonRows count={6} />
        ) : rows.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-3xl shadow px-4 py-10 text-center">لا يوجد عملاء مطابقون.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map((c) => (
              <Link key={c.id} href={`/accounting/clients/${encodeURIComponent(c.id)}`} className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3 min-w-0 hover:shadow-lg active:bg-surface-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink text-lg break-words">{c.name || `عميل ${c.id}`}</p>
                    <p className="text-ink-soft break-words">{[c.storeName, ROUTE_LABEL[c.route], c.deliveryRoute].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-end">
                    <p className={`text-xl font-bold ${c.balance > 0 ? "text-red-700" : "text-ink"}`}><Money value={c.balance} /></p>
                    {c.credit > 0 && <p className="text-sm font-semibold text-blue-700">رصيد <Money value={c.credit} /></p>}
                  </div>
                </div>
                <AgeBar ageing={c.ageing} total={c.balance} />
                <p className="text-ink-soft">
                  {c.openInvoices ? (
                    <>
                      <span className="num">{c.openInvoices}</span> فاتورة غير مسددة · أقدمها منذ <span className="num">{c.oldestDays}</span> يوم
                    </>
                  ) : (
                    "لا فواتير غير مسددة"
                  )}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
