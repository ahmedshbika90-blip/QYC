import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { PERIODS, buildView, V } from "../lib/dashboardView";

// The supervisor's home: how the operation is doing, at a glance.
// Presentational only — every figure comes from lib/dashboardView.js, which
// reads the one /api/dashboard/summary response, so the sections can't
// disagree with each other. Colours come from the .dash palette.

const AMBER = { bg: "rgb(var(--amber-100))", ink: "rgb(var(--amber-700))" };
const num = "dn";

function Section({ id, title, hint, aside, children }) {
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 id={id} className="font-display text-[22px] font-bold text-ink">{title}</h2>
          <p className="text-sm text-muted mt-1">{hint}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Delta({ d }) {
  if (!d) return null;
  return (
    <span
      className="h-[26px] px-2.5 rounded-full text-xs font-bold flex items-center whitespace-nowrap"
      style={{ background: d.up ? V("ws") : AMBER.bg, color: d.up ? V("w") : AMBER.ink }}
    >
      {d.text}
    </span>
  );
}

function SplitBar({ a, b, h = 16, aColor = V("w"), bColor = V("r"), track = "rgb(var(--gray-100))" }) {
  return (
    <div className="flex overflow-hidden" style={{ height: h, borderRadius: h / 2, background: track }}>
      <div style={{ flex: `${a} 1 0%`, background: aColor }} />
      <div style={{ flex: `${b} 1 0%`, background: bColor, marginInlineStart: 3 }} />
    </div>
  );
}

export function PeriodMenu({ period, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const cur = PERIODS.find((p) => p.id === period) || PERIODS[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-12 px-4 rounded-2xl border border-line bg-white text-ink flex items-center gap-2.5 text-[15px] font-semibold"
      >
        <Icon name="calendar" size={18} />
        <span>{cur.label}</span>
        <Icon name="chevronDown" size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" aria-label="الفترة" className="absolute top-[calc(100%+8px)] end-0 z-30 w-[300px] max-w-[calc(100vw-2rem)] p-1.5 rounded-[18px] bg-white border border-line shadow-lg flex flex-col">
          {PERIODS.map((p) => {
            const on = p.id === period;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => { setOpen(false); onChange(p.id); }}
                className={`min-h-[46px] px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 text-sm text-start ${on ? "bg-surface-2 font-bold" : "font-medium hover:bg-surface-2"}`}
              >
                <span>{p.label}</span>
                {on && <Icon name="check" size={18} strokeWidth={2.6} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bubbles({ panels }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {panels.map((p) => (
        <div key={p.key} className="bg-white rounded-[28px] shadow p-5 flex flex-col items-center gap-4 min-w-0">
          <div className="w-full flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-ink">{p.title}</h3>
            <Delta d={p.delta} />
          </div>
          <div className="w-[196px] h-[196px] rounded-full flex items-center justify-center" style={{ background: p.ring }}>
            <div className="w-[178px] h-[178px] rounded-full bg-white flex items-center justify-center">
              <div className="w-[160px] h-[160px] rounded-full flex flex-col items-center justify-center gap-0.5" style={{ background: p.fill, color: p.fillInk }}>
                <span className="text-xs opacity-90">{p.caption}</span>
                <span className={`${num} font-display text-[42px] font-bold leading-[1.1]`}>{p.total.toLocaleString("en-US")}</span>
                <span className="text-xs opacity-90">كرتونة</span>
              </div>
            </div>
          </div>
          <div className="text-[13px] text-muted">{p.sub}</div>
          <div className="w-full flex flex-col gap-1.5">
            <div className="flex h-2 rounded-md overflow-hidden gap-[3px]">
              {p.groups.map((g) => <div key={g.id} style={{ flex: `${Math.max(g.qty, 0.0001)} 1 0%`, background: g.color }} />)}
            </div>
            <div className="flex justify-between gap-2 text-xs text-muted">
              {p.groups.map((g) => (
                <span key={g.id}>
                  <span className="inline-block w-2 h-2 rounded-full me-1.5" style={{ background: g.color }} />
                  {g.label} <span className={`${num} font-bold text-ink`}>{Math.round(g.share)}%</span>
                </span>
              ))}
            </div>
          </div>
          <div className="w-full grid grid-cols-2 items-end justify-items-center gap-y-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-2 pt-3.5 border-t border-dashed border-line">
            {p.sats.map((s) => (
              <div key={s.id} className="w-[84px] flex flex-col items-center gap-1.5">
                <div
                  className={`${num} rounded-full flex items-center justify-center font-bold`}
                  style={{ width: s.d, height: s.d, background: s.color.bg, color: s.color.ink, fontSize: s.d >= 70 ? 17 : 13 }}
                >
                  {Math.round(s.share)}%
                </div>
                <span className="text-xs font-semibold text-center leading-[1.3] text-ink">{s.name}</span>
                <span className={`${num} text-[11px] text-muted`}>{s.qty.toLocaleString("en-US")}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROW = "grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_130px_150px] items-center gap-x-4 gap-y-3 lg:gap-x-[22px]";

function ItemTable({ table, unit }) {
  const { rows, total, unitLabel } = table;
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`${ROW} hidden lg:grid px-[22px] text-xs font-semibold text-muted`}>
        <span>الصنف</span>
        <span className="flex justify-between"><span>جملة</span><span>تجزئة</span></span>
        <span>الإجمالي</span>
        <span className="text-center">الحصة من المبيعات</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`${ROW} bg-white rounded-[22px] shadow px-5 lg:px-[22px] py-4`}>
          <div className="min-w-0 flex items-center gap-3">
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: r.dot }} />
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-ink">{r.name}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-muted">{r.group}</span>
                {r.top && <span className="h-5 px-2 rounded-full text-[11px] font-bold flex items-center" style={{ background: AMBER.bg, color: AMBER.ink }}>الأعلى مبيعًا</span>}
              </div>
            </div>
          </div>
          <div className="order-3 col-span-2 lg:order-none lg:col-span-1 min-w-0">
            <div className="flex justify-between items-baseline mb-2">
              <span className={`${num} text-[15px] font-bold`} style={{ color: V("w") }}>{r.w} <span className="text-xs font-medium text-muted">{r.wPct}</span></span>
              <span className={`${num} text-[15px] font-bold`} style={{ color: V("r") }}>{r.r} <span className="text-xs font-medium text-muted">{r.rPct}</span></span>
            </div>
            <SplitBar a={r.wFlex} b={r.rFlex} />
          </div>
          <div className="order-2 lg:order-none">
            <div className={`${num} font-display text-[28px] font-bold leading-[1.1] text-ink`}>{r.total}</div>
            <div className="text-xs text-muted">{unitLabel}</div>
          </div>
          <div className="order-4 col-span-2 lg:order-none lg:col-span-1 relative h-[42px] rounded-xl bg-surface-2 overflow-hidden flex items-center justify-center">
            <div className="absolute inset-y-0 end-auto right-0" style={{ width: `${r.shareW}%`, background: V("fill", 0.13) }} />
            <span className={`${num} relative text-base font-bold text-ink`}>{r.share}</span>
          </div>
        </div>
      ))}
      <div className={`${ROW} rounded-[22px] px-5 lg:px-[22px] py-4`} style={{ background: V("tot"), color: V("toti") }}>
        <div className="text-[17px] font-bold">الإجمالي</div>
        <div className="order-3 col-span-2 lg:order-none lg:col-span-1 min-w-0">
          <div className="flex justify-between items-baseline mb-2">
            <span className={`${num} text-[15px] font-bold`}>{total.w} <span className="text-xs font-medium opacity-80">{total.wPct}</span></span>
            <span className={`${num} text-[15px] font-bold`}>{total.r} <span className="text-xs font-medium opacity-80">{total.rPct}</span></span>
          </div>
          <SplitBar a={total.wFlex} b={total.rFlex} aColor={V("wx")} bColor={V("rx")} track="transparent" />
        </div>
        <div className="order-2 lg:order-none">
          <div className={`${num} font-display text-[28px] font-bold leading-[1.1]`}>{total.total}</div>
          <div className="text-xs opacity-80">{unitLabel}</div>
        </div>
        <div className={`${num} order-4 col-span-2 lg:order-none lg:col-span-1 text-center text-base font-bold`}>100%</div>
      </div>
    </div>
  );
}

function Money({ money }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {money.map((m) => (
        <div key={m.title} className="bg-white rounded-[28px] shadow p-6 flex flex-col gap-[18px] min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-ink">{m.title}</h3>
            {m.pill && <span className="h-7 px-3 rounded-full text-[13px] font-bold flex items-center" style={{ background: V("ws"), color: V("w") }}>{m.pill}</span>}
          </div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className={`${num} font-display text-[46px] font-bold leading-[1.1] text-ink`}>{m.total}</span>
            <span className="text-[15px] font-semibold text-muted">SDG</span>
            <Delta d={m.delta} />
          </div>
          <SplitBar a={m.af} b={m.bf} h={18} />
          <div className="grid gap-3 sm:grid-cols-2">
            {[["جملة", m.ap, m.aAmt, m.aSub, "w", "ws"], ["تجزئة", m.bp, m.bAmt, m.bSub, "r", "rs"]].map(([label, p, amt, sub, c, soft]) => (
              <div key={label} className="rounded-2xl px-4 py-3.5 min-w-0" style={{ background: V(soft) }}>
                <div className="flex items-center justify-between gap-2 text-[13px] font-semibold" style={{ color: V(c) }}>
                  <span>{label}</span><span className={num}>{p}</span>
                </div>
                <div className="mt-1"><span className={`${num} text-xl font-bold text-ink`}>{amt}</span> <span className="text-xs text-muted">SDG</span></div>
                {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
              </div>
            ))}
          </div>
          {m.note && (
            <div className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Icon name="info" size={16} className="mt-0.5" />
              <span>{m.note}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const LEVEL = {
  amber: { bg: AMBER.bg, ink: AMBER.ink },
  navy: { bg: V("rs"), ink: V("r") },
  green: { bg: V("ws"), ink: V("w") },
};

function Customers({ invoices, charts }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="bg-white rounded-[28px] shadow p-6 flex flex-col gap-[18px] min-w-0 md:col-span-2 lg:col-span-1">
        <h3 className="text-base font-bold text-ink">الفواتير الصادرة</h3>
        <div className="flex items-baseline gap-2">
          <span className={`${num} font-display text-[56px] font-bold leading-[1.05] text-ink`}>{invoices.total}</span>
          <span className="text-sm text-muted">فاتورة</span>
        </div>
        <SplitBar a={invoices.wf} b={invoices.rf} h={14} />
        <div className="flex flex-col gap-3">
          {[["جملة", invoices.w, invoices.wAvg, "w", "ws"], ["تجزئة", invoices.r, invoices.rAvg, "r", "rs"]].map(([label, n, avg, c, soft]) => (
            <div key={label} className="rounded-2xl px-3.5 py-3" style={{ background: V(soft) }}>
              <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold" style={{ color: V(c) }}>{label}</span><span className={`${num} text-[22px] font-bold text-ink`}>{n}</span></div>
              <div className="text-xs text-muted mt-0.5">متوسط الفاتورة {avg}</div>
            </div>
          ))}
        </div>
      </div>
      {charts.map((c) => {
        const lv = LEVEL[c.level.tone];
        return (
          <div key={c.title} className="bg-white rounded-[28px] shadow p-6 flex flex-col gap-3.5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-ink">{c.title}</h3>
              {!c.empty && <span className="h-[26px] px-2.5 rounded-full text-xs font-bold flex items-center" style={{ background: lv.bg, color: lv.ink }}>{c.level.label}</span>}
            </div>
            {c.empty ? (
              <p className="text-sm text-muted py-8 text-center">لا توجد مبيعات في هذه الفترة</p>
            ) : (
              <>
                <div>
                  <div className={`${num} font-display text-[34px] font-bold leading-[1.1]`} style={{ color: c.color }}>{c.top3}</div>
                  <div className="text-[13px] text-muted mt-0.5">من المبيعات عند أكبر 3 عملاء</div>
                </div>
                <div className="flex h-[22px] rounded-lg overflow-hidden gap-0.5" aria-hidden="true">
                  {c.strip.map((s, i) => <div key={i} style={{ flex: `${s.f} 1 0%`, background: s.neutral ? "rgb(var(--gray-500))" : c.color, opacity: s.op }} />)}
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1.2fr)_44px] gap-2.5 px-2 text-[11px] font-semibold text-muted">
                    <span /><span>العميل</span><span>حصته من المبيعات</span><span className="text-end">تراكمي</span>
                  </div>
                  {c.rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1.2fr)_44px] gap-2.5 items-center min-h-[38px] px-2 rounded-[10px]" style={{ background: r.band }}>
                      <span className={`${num} text-xs font-bold text-muted`}>{r.rank}</span>
                      <span className="text-[13px] font-semibold text-ink truncate">{r.name}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex-1 h-2.5 rounded-md bg-surface-2 overflow-hidden flex">
                          <span className="h-full rounded-md" style={{ width: `${r.barW}%`, background: r.neutral ? "rgb(var(--gray-500))" : c.color, opacity: r.op }} />
                        </span>
                        <span className={`${num} min-w-[46px] text-[13px] font-bold text-end`}>{r.pct}</span>
                      </span>
                      <span className={`${num} text-xs text-muted text-end`}>{r.cum}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stock({ stock }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {stock.map((k) => (
        <div key={k.key} className="bg-white rounded-[28px] shadow p-[22px] flex flex-col gap-[18px] min-w-0">
          <h3 className="text-base font-bold text-ink">{k.title}</h3>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-[140px] h-[140px] rounded-full shrink-0 flex items-center justify-center" style={{ background: k.donut }}>
              <div className="w-24 h-24 rounded-full bg-white flex flex-col items-center justify-center">
                <span className={`${num} font-display text-[26px] font-bold leading-[1.1] text-ink`}>{k.total}</span>
                <span className="text-[11px] text-muted">كرتونة</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 w-full flex flex-col gap-2.5">
              {k.items.map((it) => (
                <div key={it.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-ink min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color }} />{it.name}</span>
                    <span className="flex items-center gap-1.5">
                      {it.low && <span className="h-5 px-[7px] rounded-full text-[11px] font-bold flex items-center" style={{ background: AMBER.bg, color: AMBER.ink }}>منخفض</span>}
                      <span className={`${num} text-sm font-bold`}>{it.qty}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-surface-2 overflow-hidden flex"><span className="h-full rounded" style={{ width: `${it.barW}%`, background: it.color }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2.5">
            <div className="flex-1 min-w-0 rounded-[14px] px-3 py-2.5" style={{ background: V("ws") }}>
              <div className="text-xs font-semibold" style={{ color: V("w") }}>{k.inLabel}</div>
              <div className={`${num} text-lg font-bold mt-0.5 text-ink`}>{k.inQty}</div>
            </div>
            <div className="flex-1 min-w-0 rounded-[14px] px-3 py-2.5" style={{ background: AMBER.bg }}>
              <div className="text-xs font-semibold" style={{ color: AMBER.ink }}>{k.outLabel}</div>
              <div className={`${num} text-lg font-bold mt-0.5 text-ink`}>{k.outQty}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true">
      <div className="grid gap-5 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="bg-white rounded-[28px] shadow h-[470px] animate-pulse" />)}</div>
      <div className="bg-white rounded-[28px] shadow h-[360px] animate-pulse" />
      <div className="grid gap-5 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="bg-white rounded-[28px] shadow h-[300px] animate-pulse" />)}</div>
    </div>
  );
}

export default function SupervisorDashboard({ data, unit, onUnit }) {
  const view = buildView(data, unit);
  return (
    <div className="dash flex flex-col gap-11">
      <Section id="d1" title="المبيعات بالكرتونة" hint="حجم المبيعات وتوزيعها بين الجملة والتجزئة وبين الأصناف. حجم الفقاعة يعكس الحصة.">
        <Bubbles panels={view.panels} />
      </Section>
      <Section
        id="d2"
        title="المبيعات حسب الصنف"
        hint="لكل صنف: كم بيع بالجملة وكم بالتجزئة، وحصته من إجمالي المبيعات. مرتّبة من الأعلى."
        aside={
          <div role="group" aria-label="وحدة العرض" className="flex gap-1 p-1 rounded-2xl bg-surface-2">
            {[["qty", "بالكرتونة"], ["sdg", "بالجنيه"]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={unit === id} onClick={() => onUnit(id)} className={`h-10 px-4 rounded-[10px] text-sm text-ink ${unit === id ? "bg-white font-bold shadow-sm" : "font-medium"}`}>{label}</button>
            ))}
          </div>
        }
      >
        <ItemTable table={view.table} unit={unit} />
      </Section>
      <Section id="d3" title="المبالغ" hint="إجمالي المبيعات وهامش التشغيل بالجنيه السوداني، موزّعين بين الجملة والتجزئة.">
        <Money money={view.money} />
      </Section>
      <Section id="d4" title="الفواتير وتركّز العملاء" hint="هل تعتمد المبيعات على عدد قليل من العملاء؟ كل شريحة وكل شريط يمثّل عميلًا.">
        <Customers invoices={view.invoices} charts={view.charts} />
      </Section>
      <Section id="d5" title="المخزون الحالي" hint="الرصيد لحظي ولا يتأثر بالفلتر. أما الحركة أسفل كل بطاقة فتخص الفترة المختارة.">
        <Stock stock={view.stock} />
      </Section>
    </div>
  );
}
