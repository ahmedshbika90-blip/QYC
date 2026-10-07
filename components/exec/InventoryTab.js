// Executive dashboard — tab 3 (المخزون). Loaded only when the tab is opened.
import { useEffect, useState } from "react";
import Icon from "../Icon";
import StockBoard from "../StockBoard";
import DateFields from "../DateFields";
import { Section } from "../SupervisorDashboard";
import { BarList } from "../ExecCharts";
import { SkeletonRows, Spinner } from "../Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { fmt, todayYmd, V } from "../../lib/dashboardView";
import { formatDate, formatDateTime, formatQty } from "../../lib/labels";
import { UNIT, PRODUCT_COLORS, Card, useGet, ErrorBox } from "./parts";

/* ── Tab 3: المخزون ──────────────────────────────────────────────────────── */

function ReceivedHistory({ token }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [docs, setDocs] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(null);

  const url = (c) => {
    const p = new URLSearchParams({ view: "received" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (c) p.set("cursor", c);
    return `/api/executive/stock?${p}`;
  };
  async function load() {
    setDocs(null);
    try {
      const d = await cachedGet(apiFetch, url(), token);
      setDocs(d.docs);
      setCursor(d.nextCursor);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  async function loadMore() {
    setMore(true);
    try {
      const d = await cachedGet(apiFetch, url(cursor), token);
      setDocs((x) => [...x, ...d.docs]);
      setCursor(d.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setMore(false);
    }
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, from, to]);
  useLiveRefresh(token, ["inventory"], load);

  const totals = {};
  (docs || []).forEach((d) => d.items.forEach((it) => {
    const t = (totals[it.productId] = totals[it.productId] || { name: it.name, unit: it.unit, qty: 0 });
    t.qty += it.qty;
  }));
  const totalRows = Object.entries(totals).sort((a, b) => b[1].qty - a[1].qty);
  const totalUnits = totalRows.reduce((a, [, t]) => a + t.qty, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 w-full sm:w-auto sm:self-start min-w-0">
        <DateFields compact className="flex-1 sm:w-[300px]" from={from} to={to} max={todayYmd()} onFrom={setFrom} onTo={setTo} />
        {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="h-10 px-3 rounded-xl text-sm font-semibold text-ink-soft bg-surface-2 shrink-0">آخر 90 يومًا</button>}
      </div>
      <ErrorBox error={error} onRetry={load} />
      {!docs ? (
        !error && <SkeletonRows count={4} />
      ) : docs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">لم تُستلم بضاعة معتمدة في هذه الفترة.</Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card className="p-6 flex flex-col gap-4 self-start">
              <h3 className="text-[15px] font-bold text-ink">إجمالي المستلم {from || to ? "في الفترة" : "(آخر 90 يومًا)"}</h3>
              <div className="flex flex-wrap items-baseline gap-2 min-w-0"><span className="dn font-display fig font-bold text-ink">{fmt(totalUnits)}</span><span className="text-sm text-muted">{UNIT} · {fmt(docs.length)} مستند</span></div>
              <BarList unit="" rows={totalRows.map(([id, t], i) => ({ id, label: t.name, value: t.qty, share: totalUnits ? (t.qty / totalUnits) * 100 : 0, color: V(PRODUCT_COLORS[i % PRODUCT_COLORS.length]) }))} />
            </Card>
            <Card className="self-start">
              <ul className="divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-start">
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{formatDate(d.createdAt)}</span>
                        <span className="block text-xs text-muted mt-0.5 truncate">{d.items.map((it) => it.name).join("، ")}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="dn font-bold text-ink">{fmt(d.units)}</span>
                        <span className="text-xs text-muted">{UNIT}</span>
                        <Icon name={open === d.id ? "chevronDown" : "chevronLeft"} size={16} className="text-muted" />
                      </span>
                    </button>
                    {open === d.id && (
                      <div className="px-5 pb-4 flex flex-col gap-2">
                        {d.items.map((it, i) => (
                          <div key={i} className="flex justify-between text-sm"><span className="text-ink">{it.name}</span><span className="dn">{formatQty(it.qty)} <span className="text-xs text-muted">{it.unit}</span></span></div>
                        ))}
                        <p className="text-xs text-muted mt-1">اعتُمد {formatDateTime(d.finalizedAt || d.createdAt)}{d.note ? ` · ${d.note}` : ""}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {cursor && (
                <button type="button" onClick={loadMore} disabled={more} className="w-full border-t border-line h-12 text-sm text-ink-soft flex items-center justify-center gap-2 disabled:opacity-50">
                  {more && <Spinner className="w-4 h-4" />}تحميل المزيد
                </button>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default function InventoryTab({ token }) {
  const [view, setView] = useState("now");
  const stock = useGet(token, view === "now" ? "/api/executive/stock" : null, ["inventory", "orders_car1", "orders_car2"]);
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="أقسام المخزون" className="inline-flex gap-1 p-1 rounded-xl bg-surface-2 self-start">
        {[["now", "المخزون الحالي"], ["received", "سجل الاستلام"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`h-10 px-4 rounded-lg text-sm ${view === id ? "bg-white font-bold shadow-sm text-ink" : "text-muted font-medium"}`}>
            {label}
          </button>
        ))}
      </div>
      {view === "now" ? (
        <Section id="i1" title="المخزون الحالي" hint="الرصيد اللحظي في المخزن الرئيسي وفي كل سيارة — بالكميات فقط.">
          <ErrorBox error={stock.error} onRetry={stock.reload} />
          {stock.data ? <StockBoard products={stock.data.products} /> : !stock.error && <SkeletonRows count={6} />}
        </Section>
      ) : (
        <Section id="i2" title="البضاعة المستلمة في المخزن" hint="استلامات المخزن المعتمدة، الأحدث أولًا. اضغط على أي استلام لرؤية أصنافه.">
          <ReceivedHistory token={token} />
        </Section>
      )}
    </div>
  );
}

// ── Brands ribbon: the company and its two brands, with this period's
// numbers. Cards rise in one after another when the dashboard opens; the
// figures come from the same overview data as the tab below (cached, no
// extra reads).
