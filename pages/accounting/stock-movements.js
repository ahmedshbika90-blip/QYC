import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import AdjustmentList from "../../components/AdjustmentList";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { useApi, Choice, ErrorLine, presetPeriod, todayYmd, Money } from "../../components/accounting/parts";

// حركة المخزون (accountant, view only): damage reports, damaged write-offs
// and free samples — requested, approved and rejected — with their margin
// effect. Filter by kind, status and period.
const field = "w-full border border-line rounded-xl px-3 h-12 text-base bg-white";

export default function StockMovements() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const router = useRouter();
  const [kind, setKind] = useState("");
  const focus = typeof router.query.focus === "string" ? router.query.focus : "";
  // a notification opens the right kind and highlights the request
  useEffect(() => {
    if (["writeoff", "freeSample", "damage"].includes(router.query.tab)) setKind(router.query.tab);
  }, [router.query.tab]);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(`adj-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 500);
    return () => clearTimeout(t);
  }, [focus, kind]);
  const [status, setStatus] = useState("");
  const [p, setP] = useState(() => presetPeriod("month"));
  const [open, setOpen] = useState(false);
  const { data, error, reload } = useApi(token, `/api/stock-adjustments?withDamage=1&from=${p.from}&to=${p.to}${kind ? `&kind=${kind}` : ""}${status ? `&status=${status}` : ""}`);
  const rows = data?.rows || [];
  const deducted = useMemo(() => rows.reduce((a, r) => a + (r.status === "approved" ? Number(r.marginDeduction) || 0 : 0), 0), [rows]);
  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-3xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">حركة المخزون</h1>
          <p className="text-ink-soft mt-1">التالف وتسويته والعينات المجانية — الطلبات والمعتمد والمرفوض، وأثرها على الهامش.</p>
        </div>
        <div>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 text-ink bg-white rounded-xl px-4 h-12 shadow-sm font-semibold">
            <Icon name="filter" size={18} className="text-ink-soft" /> تصفية · <span className="num" dir="ltr">{p.from} → {p.to}</span>
            <Icon name="chevronDown" size={18} className={`text-ink-soft ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <section className="bg-white rounded-3xl shadow p-4 sm:p-5 mt-2 flex flex-col gap-4">
              <Choice label="النوع" value={kind} onChange={setKind} options={[["", "الكل"], ["damage", "تقارير التالف"], ["writeoff", "تسوية تالف"], ["freeSample", "عينات مجانية"]]} />
              <Choice label="الحالة" value={status} onChange={setStatus} options={[["", "الكل"], ["pending", "بانتظار القرار"], ["approved", "معتمد"], ["rejected", "مرفوض"]]} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">من<input type="date" value={p.from} max={p.to} onChange={(e) => e.target.value && setP((x) => ({ ...x, from: e.target.value }))} className={field} /></label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">إلى<input type="date" value={p.to} min={p.from} max={todayYmd()} onChange={(e) => e.target.value && setP((x) => ({ ...x, to: e.target.value }))} className={field} /></label>
              </div>
            </section>
          )}
        </div>
        {deducted > 0 && (
          <p className="rounded-2xl bg-red-50 text-red-800 font-bold px-4 py-3">مخصوم من الهامش في هذه القائمة: <Money value={deducted} /></p>
        )}
        <ErrorLine error={error} onRetry={reload} />
        {!data ? <SkeletonRows count={5} /> : <AdjustmentList rows={rows} focus={focus} />}
      </main>
    </div>
  );
}
