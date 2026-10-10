import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import SectionTabs from "../components/SectionTabs";
import { useNotifications } from "../lib/useNotifications";
import { getAuthFlags } from "../lib/authFlags";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import Icon from "../components/Icon";
import QtyStepper from "../components/QtyStepper";
import SuccessToast from "../components/SuccessToast";
import AdjustmentList from "../components/AdjustmentList";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { invalidate } from "../lib/apiCache";
import { useRequestId } from "../lib/useRequestId";
import { useApi, Choice, ErrorLine } from "../components/accounting/parts";

// تسويات المخزون (warehouse keeper and manager):
//   تسوية تالف    — keeper asks (transfer / obsolete) from the تالف balance; manager approves
//   عينات مجانية  — manager asks (supplier / company) from the depot; keeper executes
//   تحويل بضاعة   — the existing goods transfers
const TABS = [["writeoff", "تسوية تالف"], ["freeSample", "عينات مجانية"], ["transfer", "تحويل بضاعة"]];

function NewRequest({ token, kind, products, onDone, onCancel, showMargin }) {
  const writeoff = kind === "writeoff";
  const field = writeoff ? "damaged" : "depot";
  const avail = products.filter((p) => (Number(p.stock?.[field]) || 0) > 0);
  const [mode, setMode] = useState(writeoff ? "transfer" : "supplier");
  const [qty, setQty] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rid = useRequestId();
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([productId, q]) => ({ productId, qty: q }));
  async function save() {
    setError("");
    if (!items.length) return setError("اختر الأصناف وكمياتها");
    const body = { kind, mode, items, note };
    setBusy(true);
    try {
      const res = await apiFetch("/api/stock-adjustments", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, requestId: rid.idFor(body) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      rid.reset();
      onDone(writeoff ? "أُرسل طلب التسوية إلى المدير" : "أُرسل طلب العينات إلى أمين المخزن");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-ink">{writeoff ? "تسوية تالف" : "طلب عينات مجانية"}</h2>
      <Choice
        label={writeoff ? "نوع التسوية" : "على حساب"}
        value={mode}
        onChange={setMode}
        options={
          writeoff
            ? [["transfer", "مرتجع شركة"], ["obsolete", "غير صالحة"]] // the keeper just names what happened
            : showMargin
            ? [["supplier", "المورد — بدون قيمة"], ["company", "الشركة — تُخصم التكلفة من الهامش"]]
            : [["supplier", "المورد"], ["company", "الشركة"]]
        }
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-soft">{writeoff ? "من رصيد التالف" : "من المخزن"}</p>
        {avail.length === 0 ? (
          <p className="text-ink-soft">{writeoff ? "لا يوجد تالف في المخزن." : "لا يوجد رصيد في المخزن."}</p>
        ) : (
          avail.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-2">
              <span className="min-w-0 break-words">
                <span className="font-semibold text-ink">{p.name}</span> <span className="text-sm text-ink-soft">المتاح <span className="num">{p.stock[field]}</span></span>
              </span>
              <QtyStepper value={qty[p.id] || 0} min={0} max={Number(p.stock[field])} onChange={(v) => setQty((q) => ({ ...q, [p.id]: Math.max(0, Math.min(Number(p.stock[field]), v)) }))} />
            </div>
          ))
        )}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
        ملاحظة (اختياري)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="w-full border border-line rounded-xl px-3 h-12 text-base" />
      </label>
      <ErrorLine error={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border-2 border-line font-semibold">إلغاء</button>
        <button type="button" onClick={save} disabled={busy || !items.length} className="h-12 rounded-xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2 disabled:opacity-40">
          {busy && <Spinner className="w-4 h-4" />}
          إرسال الطلب
        </button>
      </div>
    </section>
  );
}

export default function StockAdjustments() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper", "manager"]);
  const router = useRouter();
  const [tab, setTab] = useState("writeoff");
  // A notification opens the exact section (?tab=) and request (?focus=).
  const focus = typeof router.query.focus === "string" ? router.query.focus : "";
  useEffect(() => {
    if (["writeoff", "freeSample", "transfer"].includes(router.query.tab)) setTab(router.query.tab);
  }, [router.query.tab]);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(`adj-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    return () => clearTimeout(t);
  }, [focus, tab]);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [adding, setAdding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showMargin = role !== "warehouse_keeper"; // the keeper doesn't deal with the margin
  // the red counts of the menu item, per section
  const { items: notes } = useNotifications(token, role, getAuthFlags().uid);
  const counts = useMemo(() => {
    const c = {};
    for (const it of notes || []) {
      if (!it.needsAction) continue;
      const t = it.bucket === "transfer" ? "transfer" : it.bucket === "adjust" ? it.tab : null;
      if (t) c[t] = (c[t] || 0) + 1;
    }
    return c;
  }, [notes]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const list = useApi(token, tab === "transfer" ? null : `/api/stock-adjustments?kind=${tab}${status ? `&status=${status}` : ""}`);
  const prods = useApi(token, "/api/products/list");
  const rows = useMemo(() => (list.data?.rows || []).filter((r) => !mode || r.mode === mode), [list.data, mode]);
  const canRequest = (tab === "writeoff" && role === "warehouse_keeper") || (tab === "freeSample" && role === "manager");
  const canDecide = (a) => a.status === "pending" && ((a.kind === "writeoff" && role === "manager") || (a.kind === "freeSample" && role === "warehouse_keeper"));

  async function decide(a, action) {
    const note = action === "reject" ? window.prompt("سبب الرفض؟") : "";
    if (action === "reject" && !note) return;
    setBusy(`${a.id}-${action}`);
    try {
      const res = await apiFetch("/api/stock-adjustments", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: a.id, action, note }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setToast(action === "approve" ? (a.kind === "freeSample" ? "تم تنفيذ العينات" : "تم اعتماد التسوية") : "تم الرفض");
      invalidate("/api/stock-adjustments");
      invalidate("/api/products");
      list.reload();
      prods.reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy("");
    }
  }

  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="w-full max-w-3xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">تسويات المخزون</h1>
          <p className="text-ink-soft mt-1">بضاعة تخرج من المخزون بغير البيع: تسوية التالف، العينات المجانية، وتحويل البضاعة.</p>
        </div>
        <SectionTabs value={tab} onChange={(t) => { setTab(t); setAdding(false); setMode(""); router.replace({ pathname: router.pathname, query: { tab: t } }, undefined, { shallow: true }); }} tabs={TABS.map(([v, l]) => [v, l, counts[v] || 0])} />
        {tab === "transfer" ? (
          <Link href={role === "manager" ? "/transfers" : "/warehouse/transfers"} className="h-14 rounded-2xl bg-white shadow font-bold text-ink flex items-center justify-center gap-2">
            <Icon name="truck" size={22} /> فتح طلبات تحويل البضاعة
          </Link>
        ) : (
          <>
            {canRequest && !adding && (
              <button type="button" onClick={() => setAdding(true)} className="h-14 rounded-2xl bg-accent text-on-accent font-bold text-lg flex items-center justify-center gap-2 shadow">
                <Icon name="plus" size={22} />
                {tab === "writeoff" ? "تسوية تالف" : "طلب عينات مجانية"}
              </button>
            )}
            {adding && prods.data && (
              <NewRequest token={token} kind={tab} showMargin={showMargin} products={prods.data.products || []} onCancel={() => setAdding(false)} onDone={(m) => { setAdding(false); setToast(m); invalidate("/api/stock-adjustments"); list.reload(); }} />
            )}
            <div>
              <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className="flex items-center gap-2 text-ink bg-white rounded-xl px-4 h-12 shadow-sm font-semibold">
                <Icon name="filter" size={18} className="text-ink-soft" />
                تصفية
                {(status ? 1 : 0) + (mode ? 1 : 0) > 0 && <span className="bg-accent text-on-accent text-sm rounded-full w-6 h-6 flex items-center justify-center num">{(status ? 1 : 0) + (mode ? 1 : 0)}</span>}
                <Icon name="chevronDown" size={18} className={`text-ink-soft transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </button>
              {filtersOpen && (
                <section className="bg-white rounded-3xl shadow p-4 sm:p-5 mt-2 flex flex-col gap-4">
                  <Choice label="الحالة" value={status} onChange={setStatus} options={[["", "الكل"], ["pending", "بانتظار القرار"], ["approved", "معتمد"], ["rejected", "مرفوض"]]} />
                  {(tab === "writeoff" || showMargin) && (
                    <Choice label="النوع" value={mode} onChange={setMode} options={tab === "writeoff" ? [["", "الكل"], ["transfer", "مرتجع شركة"], ["obsolete", "غير صالحة"]] : [["", "الكل"], ["supplier", "على المورد"], ["company", "على الشركة"]]} />
                  )}
                </section>
              )}
            </div>
            <ErrorLine error={list.error} onRetry={list.reload} />
            {!list.data ? (
              <SkeletonRows count={4} />
            ) : (
              <AdjustmentList
                rows={rows}
                showMargin={showMargin}
                hideSampleMode={!showMargin}
                focus={focus}
                actionsFor={(a) =>
                  canDecide(a) && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button type="button" disabled={!!busy} onClick={() => decide(a, "reject")} className="h-11 rounded-xl border-2 border-line text-red-700 font-semibold">رفض</button>
                      <button type="button" disabled={!!busy} onClick={() => decide(a, "approve")} className="h-11 rounded-xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2">
                        {busy === `${a.id}-approve` && <Spinner className="w-4 h-4" />}
                        {a.kind === "freeSample" ? "تنفيذ" : "اعتماد"}
                      </button>
                    </div>
                  )
                }
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
