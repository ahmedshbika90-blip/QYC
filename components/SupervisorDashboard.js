import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import DateFields from "./DateFields";
import { useLang } from "../lib/i18n";
import { UNIT, TREND_KINDS, buildView, niceScale, todayYmd, V, fmt } from "../lib/dashboardView";

// The supervisor's home: how the operation is doing, at a glance.
// Presentational only — every figure comes from lib/dashboardView.js.
// Colour rules (styles/globals.css, .dash): wholesale is always forest
// green, retail always navy, in every section; products use cool tones.
// No yellow or red anywhere on this page — a fall is shown by its sign
// and a neutral chip, not by an alarm colour.

const num = "dn";
const NEUTRAL = { bg: "rgb(var(--gray-100))", ink: "rgb(var(--gray-700))" };

/* ── shared pieces ─────────────────────────────────────────────────────── */

function Section({ id, title, hint, aside, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <span aria-hidden="true" className="mt-1.5 w-1.5 h-6 rounded-full shrink-0" style={{ background: V("tot") }} />
          <div className="min-w-0">
            <h2 id={id} className="font-display text-xl font-bold text-ink">{title}</h2>
            {hint && <p className="text-sm text-muted mt-1 leading-relaxed">{hint}</p>}
          </div>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

const Card = ({ className = "", children, style }) => (
  <div className={`bg-white rounded-2xl shadow min-w-0 ${className}`} style={style}>{children}</div>
);

function Delta({ d }) {
  if (!d) return null;
  return (
    <span
      className="h-7 px-2.5 rounded-full text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
      style={{ background: d.up ? V("ws") : NEUTRAL.bg, color: d.up ? V("w") : NEUTRAL.ink }}
    >
      <Icon name={d.up ? "trendUp" : "trendDown"} size={14} strokeWidth={2.4} />
      {d.text}
    </span>
  );
}

function SplitBar({ a, b, h = 12, aColor = V("w"), bColor = V("r"), track = "rgb(var(--gray-100))" }) {
  return (
    <div className="flex overflow-hidden" style={{ height: h, borderRadius: h / 2, background: track }}>
      <div style={{ flex: `${a} 1 0%`, background: aColor }} />
      <div style={{ flex: `${b} 1 0%`, background: bColor, marginInlineStart: 2 }} />
    </div>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl bg-surface-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-9 px-3.5 rounded-lg text-sm text-ink ${value === o.id ? "bg-white font-bold shadow-sm" : "font-medium text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── date range (same pattern as the app's other date filters) ─────────── */

export function DateRange({ from, to, onChange }) {
  const today = todayYmd();
  const set = (f, t) => {
    if (!f || !t) return;
    if (f > t) [f, t] = [t, f]; // picking an end before the start just swaps them
    onChange(f, t);
  };
  const isToday = from === today && to === today;
  return (
    <div role="group" aria-label="فترة الملخص" className="w-full sm:w-auto flex items-end gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 min-w-0">
      <DateFields compact className="flex-1 sm:w-[300px]" from={from} to={to} max={today} onFrom={(v) => set(v, to)} onTo={(v) => set(from, v)} />
      {!isToday && (
        <button type="button" onClick={() => onChange(today, today)} className="h-10 px-3 rounded-xl text-sm font-semibold text-ink-soft bg-surface-2 hover:bg-line shrink-0">
          اليوم
        </button>
      )}
    </div>
  );
}

/* ── trend chart ───────────────────────────────────────────────────────── */

const SERIES = [
  { key: "t", label: "الإجمالي", color: V("tl"), width: 3 },
  { key: "w", label: "جملة", color: V("w"), width: 2.25 },
  { key: "r", label: "تجزئة", color: V("r"), width: 2.25 },
];

export function TrendChart({ trend, kind, onKind, loading }) {
  const wrap = useRef(null);
  const [w, setW] = useState(900);
  const [show, setShow] = useState({ t: true, w: true, r: true });
  const [hover, setHover] = useState(null);
  // Time runs with the reading direction: newest at the left in Arabic,
  // at the right in English; the units axis sits on the start side.
  const rtl = useLang() !== "en";

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => setW(Math.max(300, Math.round(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = trend ? trend.points : [];
  const n = pts.length;
  const H = w < 600 ? 240 : 300;
  // Right-to-left like the rest of the app: oldest at the right, newest at the
  // left; the units axis sits on the right (the start side).
  const plotL = rtl ? 8 : 52, plotR = rtl ? w - 52 : w - 8, plotT = 14, plotB = H - 34;
  const vals = pts.flatMap((p) => SERIES.filter((s) => show[s.key]).map((s) => p[s.key]));
  const { max, step } = niceScale(Math.max(0, ...vals), 4);
  const step_ = n <= 1 ? 0 : (plotR - plotL) / (n - 1);
  const x = (i) => (n <= 1 ? (plotL + plotR) / 2 : rtl ? plotR - i * step_ : plotL + i * step_);
  const y = (v) => plotB - (v / max) * (plotB - plotT);
  const line = (key) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((plotR - plotL) / 72))));
  const empty = n > 0 && pts.every((p) => p.t === 0);

  const pick = (clientX) => {
    if (!n || !wrap.current) return;
    const px = clientX - wrap.current.getBoundingClientRect().left;
    const i = n <= 1 ? 0 : Math.round((rtl ? plotR - px : px - plotL) / step_);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e) => {
    if (!n) return;
    const cur = hover ?? n - 1;
    const fwd = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
    const next = { [fwd]: cur + 1, [back]: cur - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(n - 1, next)));
  };
  const toggle = (k) => setShow((s) => {
    const next = { ...s, [k]: !s[k] };
    return Object.values(next).some(Boolean) ? next : s; // keep at least one line visible
  });
  const hp = hover != null ? pts[hover] : null;
  const tipLeft = hover != null ? Math.max(0, Math.min(w - 196, x(hover) - 98)) : 0;

  return (
    <Card className="p-5 md:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className="text-xs text-muted">مجموع {trend ? trend.span : ""}</div>
            <div className="mt-0.5"><span className={`${num} font-display text-[28px] font-bold leading-tight text-ink`}>{trend ? trend.total : "—"}</span> <span className="text-sm text-muted">{UNIT}</span></div>
          </div>
          <div>
            <div className="text-xs text-muted">المتوسط في {trend ? trend.per : ""}</div>
            <div className="mt-0.5"><span className={`${num} font-display text-[28px] font-bold leading-tight text-ink`}>{trend ? trend.avg : "—"}</span> <span className="text-sm text-muted">{UNIT}</span></div>
          </div>
        </div>
        <Segmented label="دقة المنحنى" options={TREND_KINDS} value={kind} onChange={(k) => { setHover(null); onKind(k); }} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="الخطوط الظاهرة">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={show[s.key]}
            onClick={() => toggle(s.key)}
            className={`h-8 px-3 rounded-full border text-[13px] font-semibold inline-flex items-center gap-2 ${show[s.key] ? "border-line bg-white text-ink" : "border-dashed border-line bg-transparent text-muted"}`}
          >
            <span className="w-4 rounded-full" style={{ height: s.key === "t" ? 4 : 3, background: show[s.key] ? s.color : "rgb(var(--gray-300))" }} />
            {s.label}
          </button>
        ))}
      </div>

      <figure className="m-0">
        <figcaption className="sr-only">عدد الوحدات المباعة {trend ? trend.span : ""}، من الأقدم إلى الأحدث.</figcaption>
        <div
          ref={wrap}
          className={`relative select-none outline-none rounded-xl focus-visible:ring-2 ${loading ? "opacity-50" : ""}`}
          style={{ height: H, touchAction: "pan-y" }}
          tabIndex={0}
          aria-label="منحنى تطور المبيعات — استخدم الأسهم للتنقل بين النقاط"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <svg width={w} height={H} aria-hidden="true" className="block overflow-visible">
            <defs>
              <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={V("tl", 0.22)} />
                <stop offset="100%" stopColor={V("tl", 0)} />
              </linearGradient>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={plotL} x2={plotR} y1={y(v)} y2={y(v)} stroke="rgb(var(--gray-200))" strokeDasharray={v ? "3 5" : undefined} />
                <text x={rtl ? plotR + 10 : plotL - 10} y={y(v) + 4} fontSize="11" textAnchor={rtl ? "start" : "end"} fill="rgb(var(--gray-500))" style={{ direction: "ltr" }}>{fmt(v)}</text>
              </g>
            ))}
            {pts.map((p, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every)) && (
              <text key={i} x={x(i)} y={H - 10} fontSize="11" textAnchor="middle" fill="rgb(var(--gray-500))">{p.label}</text>
            ))}
            {show.t && n > 1 && <path d={`${line("t")} L${x(n - 1)},${plotB} L${x(0)},${plotB} Z`} fill="url(#trendArea)" />}
            {SERIES.filter((s) => show[s.key] && n > 0).map((s) => (
              <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {hp && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={plotT} y2={plotB} stroke="rgb(var(--gray-400))" strokeDasharray="4 4" />
                {SERIES.filter((s) => show[s.key]).map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(hp[s.key])} r="5" fill="rgb(var(--white))" stroke={s.color} strokeWidth="2.5" />
                ))}
              </g>
            )}
          </svg>
          {empty && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">لا توجد مبيعات في هذه الفترة</div>}
          {hp && (
            <div className="absolute top-2 w-[196px] rounded-xl bg-white shadow-lg border border-line px-3 py-2.5 pointer-events-none" style={{ left: tipLeft }}>
              <div className="text-xs font-semibold text-ink mb-1.5">{hp.tip}</div>
              {SERIES.filter((s) => show[s.key]).map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 text-xs py-0.5">
                  <span className="flex items-center gap-2 text-muted"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className={`${num} font-bold text-ink`}>{fmt(hp[s.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <table className="sr-only">
          <thead><tr><th>الفترة</th><th>الإجمالي</th><th>جملة</th><th>تجزئة</th></tr></thead>
          <tbody>{pts.map((p, i) => <tr key={i}><td>{p.tip}</td><td>{p.t}</td><td>{p.w}</td><td>{p.r}</td></tr>)}</tbody>
        </table>
      </figure>
    </Card>
  );
}

/* ── headline units ────────────────────────────────────────────────────── */

function Kpis({ kpis }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {kpis.map((k) => (
        <Card key={k.key} className="p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-bold text-ink">{k.title}</h3>
            <Delta d={k.delta} />
          </div>
          <div className="flex items-center gap-5">
            <div className="w-[132px] h-[132px] rounded-full shrink-0 flex items-center justify-center" style={{ background: k.ring }}>
              <div className="w-[118px] h-[118px] rounded-full bg-white flex items-center justify-center">
                <div className="w-[104px] h-[104px] rounded-full flex flex-col items-center justify-center" style={{ background: k.fill, color: k.fillInk }}>
                  <span className={`${num} font-display text-[30px] font-bold leading-none`}>{k.total}</span>
                  <span className="text-[11px] mt-1 opacity-90">{UNIT}</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {k.sub.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                  <span className={`${num} text-lg font-bold text-ink`}>{s.value}</span>
                </div>
              ))}
              <div className="h-px bg-line" />
              {k.groups.map((g) => (
                <div key={g.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-muted"><span className="w-2 h-2 rounded-full" style={{ background: g.color }} />{g.label}</span>
                    <span className={`${num} font-bold text-ink`}>{g.share}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden flex"><span className="h-full rounded-full" style={{ width: `${g.w}%`, background: g.color }} /></div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── money ─────────────────────────────────────────────────────────────── */

function Money({ money }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {money.map((m) => (
        <Card key={m.title} className="p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-bold text-ink">{m.title}</h3>
            {m.pill && <span className="h-7 px-3 rounded-full text-[13px] font-bold inline-flex items-center" style={{ background: V("ws"), color: V("w") }}>{m.pill}</span>}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2">
            <span className={`${num} font-display fig font-bold text-ink min-w-0`}>{m.total}</span>
            <span className="text-[15px] font-semibold text-muted">SDG</span>
            <Delta d={m.delta} />
          </div>
          <SplitBar a={m.af} b={m.bf} h={14} />
          <div className="grid gap-3 sm:grid-cols-2">
            {[["جملة", m.ap, m.aAmt, m.aSub, "w", "ws"], ["تجزئة", m.bp, m.bAmt, m.bSub, "r", "rs"]].map(([label, p, amt, sub, c, soft]) => (
              <div key={label} className="rounded-xl px-4 py-3.5" style={{ background: V(soft) }}>
                <div className="flex items-center justify-between gap-2 text-[13px] font-semibold" style={{ color: V(c) }}>
                  <span>{label}</span><span className={num}>{p}</span>
                </div>
                <div className="mt-1"><span className={`${num} text-xl font-bold text-ink`}>{amt}</span> <span className="text-xs text-muted">SDG</span></div>
                {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
              </div>
            ))}
          </div>
          {m.note && (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted m-0">
              <Icon name="info" size={16} className="mt-0.5" />
              <span>{m.note}</span>
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ── items ─────────────────────────────────────────────────────────────── */

// Mobile: a card per product (name + total, then wholesale | retail, then the
// mix bar). Desktop: aligned columns.
const ROW = "grid grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] items-center gap-x-6 gap-y-4";

function Cell({ value, cap, color, unit }) {
  return (
    <div className="min-w-0">
      <div><span className={`${num} font-display text-[22px] font-bold leading-tight`} style={{ color: color || "inherit" }}>{value}</span>{unit && <span className="text-xs text-muted ms-1.5">{unit}</span>}</div>
      <div className="text-xs text-muted mt-0.5">{cap}</div>
    </div>
  );
}

function ItemTable({ table }) {
  const { rows, total, unitLabel } = table;
  return (
    <div className="flex flex-col gap-3">
      <div className={`${ROW} hidden lg:grid px-6 text-xs font-semibold text-muted`}>
        <span>الصنف</span>
        <span style={{ color: V("w") }}>جملة</span>
        <span style={{ color: V("r") }}>تجزئة</span>
        <span>الإجمالي</span>
        <span>توزيع الصنف بين الجملة والتجزئة</span>
      </div>
      {rows.map((r) => (
        <Card key={r.id} className={`${ROW} px-5 lg:px-6 py-5`}>
          <div className="order-1 lg:order-none min-w-0 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: r.dot }} />
            <div className="min-w-0">
              <div className="text-base font-bold text-ink">{r.name}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-xs text-muted">{r.group}</span>
                {r.top && <span className="h-5 px-2 rounded-full text-[11px] font-bold inline-flex items-center gap-1" style={{ background: V("ws"), color: V("w") }}><Icon name="star" size={11} strokeWidth={2.4} />الأعلى</span>}
              </div>
            </div>
          </div>
          <div className="order-3 lg:order-none"><Cell value={r.w} cap={r.wCap} color={V("w")} /></div>
          <div className="order-4 lg:order-none"><Cell value={r.r} cap={r.rCap} color={V("r")} /></div>
          <div className="order-2 lg:order-none text-end lg:text-start">
            <Cell value={r.total} cap={r.tCap} unit={unitLabel} />
            <div className="hidden lg:flex h-1 mt-2 rounded-full bg-surface-2 overflow-hidden"><span className="h-full rounded-full" style={{ width: `${r.shareW}%`, background: V("tot", 0.55) }} /></div>
          </div>
          <div className="order-5 lg:order-none col-span-2 lg:col-span-1 min-w-0">
            <SplitBar a={r.wFlex} b={r.rFlex} h={10} />
            <div className="flex justify-between mt-2 text-xs">
              <span style={{ color: V("w") }}>جملة <span className={`${num} font-bold`}>{r.wMix}</span></span>
              <span style={{ color: V("r") }}>تجزئة <span className={`${num} font-bold`}>{r.rMix}</span></span>
            </div>
          </div>
        </Card>
      ))}
      <div className={`${ROW} rounded-2xl px-5 lg:px-6 py-5`} style={{ background: V("tot"), color: V("toti") }}>
        <div className="order-1 lg:order-none text-base font-bold">الإجمالي</div>
        <div className="order-3 lg:order-none"><Cell value={total.w} cap={<span style={{ color: V("toti", 0.75) }}>{total.wCap}</span>} color={V("wx")} /></div>
        <div className="order-4 lg:order-none"><Cell value={total.r} cap={<span style={{ color: V("toti", 0.75) }}>{total.rCap}</span>} color={V("rx")} /></div>
        <div className="order-2 lg:order-none text-end lg:text-start">
          <div><span className={`${num} font-display text-[22px] font-bold leading-tight`}>{total.total}</span><span className="text-xs ms-1.5" style={{ color: V("toti", 0.75) }}>{unitLabel}</span></div>
          <div className="text-xs mt-0.5" style={{ color: V("toti", 0.75) }}>100%</div>
        </div>
        <div className="order-5 lg:order-none col-span-2 lg:col-span-1 min-w-0">
          <SplitBar a={total.wFlex} b={total.rFlex} h={10} aColor={V("wx")} bColor={V("rx")} track="transparent" />
          <div className="flex justify-between mt-2 text-xs" style={{ color: V("toti", 0.85) }}>
            <span>جملة <span className={`${num} font-bold`}>{total.wMix}</span></span>
            <span>تجزئة <span className={`${num} font-bold`}>{total.rMix}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── invoices & customers ──────────────────────────────────────────────── */

const LEVEL = {
  slate: { bg: NEUTRAL.bg, ink: NEUTRAL.ink, icon: "alert" },
  navy: { bg: V("rs"), ink: V("r"), icon: "info" },
  green: { bg: V("ws"), ink: V("w"), icon: "check" },
};

function Customers({ invoices, charts }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-6 flex flex-col gap-5 md:col-span-2 xl:col-span-1">
        <h3 className="text-[15px] font-bold text-ink">الفواتير الصادرة</h3>
        <div className="flex items-baseline gap-2">
          <span className={`${num} font-display fig font-bold text-ink min-w-0`}>{invoices.total}</span>
          <span className="text-sm text-muted">فاتورة</span>
        </div>
        <SplitBar a={invoices.wf} b={invoices.rf} h={10} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {[["جملة", invoices.w, invoices.wAvg, "w", "ws"], ["تجزئة", invoices.r, invoices.rAvg, "r", "rs"]].map(([label, n, avg, c, soft]) => (
            <div key={label} className="rounded-xl px-4 py-3" style={{ background: V(soft) }}>
              <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold" style={{ color: V(c) }}>{label}</span><span className={`${num} text-xl font-bold text-ink`}>{n}</span></div>
              <div className="text-xs text-muted mt-1">متوسط الفاتورة {avg}</div>
            </div>
          ))}
        </div>
      </Card>
      {charts.map((c) => {
        const lv = LEVEL[c.level.tone];
        const color = V(c.colorName);
        return (
          <Card key={c.title} className="p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink">{c.title}</h3>
              {!c.empty && <span className="h-7 px-2.5 rounded-full text-xs font-bold inline-flex items-center gap-1" style={{ background: lv.bg, color: lv.ink }}><Icon name={lv.icon} size={13} strokeWidth={2.4} />{c.level.label}</span>}
            </div>
            {c.empty ? (
              <p className="text-sm text-muted py-10 text-center m-0">لا توجد مبيعات في هذه الفترة</p>
            ) : (
              <>
                <div>
                  <span className={`${num} font-display text-[32px] font-bold leading-none`} style={{ color }}>{c.top3}</span>
                  <span className="text-[13px] text-muted ms-2">من المبيعات عند أكبر 3 عملاء</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5" aria-hidden="true">
                  {c.strip.map((s, i) => <div key={i} style={{ flex: `${s.f} 1 0%`, background: s.neutral ? "rgb(var(--gray-300))" : color, opacity: s.op }} />)}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,1.2fr)_42px] gap-3 px-2 text-[11px] font-semibold text-muted">
                    <span /><span>العميل</span><span>حصته من المبيعات</span><span className="text-end">تراكمي</span>
                  </div>
                  {c.rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,1.2fr)_42px] gap-3 items-center min-h-[40px] px-2 rounded-lg" style={{ background: r.band }}>
                      <span className={`${num} text-xs font-bold text-muted`}>{r.rank}</span>
                      <span className="text-[13px] font-semibold text-ink truncate" title={r.name}>{r.name}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden flex">
                          <span className="h-full rounded-full" style={{ width: `${r.barW}%`, background: r.neutral ? "rgb(var(--gray-300))" : color, opacity: r.op }} />
                        </span>
                        <span className={`${num} min-w-[46px] text-[13px] font-bold text-end text-ink`}>{r.pct}</span>
                      </span>
                      <span className={`${num} text-xs text-muted text-end`}>{r.cum}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ── stock ─────────────────────────────────────────────────────────────── */

function Stock({ stock }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {stock.map((k) => (
        <Card key={k.key} className="p-6 flex flex-col gap-5">
          <h3 className="text-[15px] font-bold text-ink">{k.title}</h3>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-[128px] h-[128px] rounded-full shrink-0 flex items-center justify-center" style={{ background: k.donut }}>
              <div className="w-[88px] h-[88px] rounded-full bg-white flex flex-col items-center justify-center">
                <span className={`${num} font-display text-[24px] font-bold leading-none text-ink`}>{k.total}</span>
                <span className="text-[11px] text-muted mt-1">{UNIT}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
              {k.items.map((it) => (
                <div key={it.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-ink min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color }} /><span className="truncate">{it.name}</span></span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {it.low && <span className="h-5 px-2 rounded-full text-[11px] font-bold inline-flex items-center gap-1" style={{ background: NEUTRAL.bg, color: NEUTRAL.ink }}><Icon name="alert" size={11} strokeWidth={2.4} />منخفض</span>}
                      <span className={`${num} text-sm font-bold text-ink`}>{it.qty}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden flex"><span className="h-full rounded-full" style={{ width: `${it.barW}%`, background: it.color }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-auto">
            {[[k.inLabel, k.inQty, "plus"], [k.outLabel, k.outQty, "minus"]].map(([label, q, icon]) => (
              <div key={label} className="rounded-xl bg-surface-2 px-3.5 py-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted"><Icon name={icon} size={13} strokeWidth={2.6} />{label}</div>
                <div className={`${num} text-lg font-bold text-ink mt-1`}>{q}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── page body ─────────────────────────────────────────────────────────── */

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-12" aria-busy="true">
      <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="bg-white rounded-2xl shadow h-[220px] animate-pulse" />)}</div>
      <div className="grid gap-5 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="bg-white rounded-2xl shadow h-[300px] animate-pulse" />)}</div>
      <div className="bg-white rounded-2xl shadow h-[360px] animate-pulse" />
    </div>
  );
}

export default function SupervisorDashboard({ data, unit, onUnit }) {
  const view = buildView(data, unit);
  return (
    <div className="flex flex-col gap-12">
      <Section id="d1" title="الوحدات المباعة" hint="عدد الوحدات المباعة في الفترة المختارة، وتوزيعها بين الجملة والتجزئة وبين مجموعتي المنتجات.">
        <Kpis kpis={view.kpis} />
      </Section>
      <Section id="d2" title="المبالغ" hint="إجمالي المبيعات وهامش التشغيل بالجنيه السوداني.">
        <Money money={view.money} />
      </Section>
      <Section
        id="d3"
        title="المبيعات حسب الصنف"
        hint="حصة كل صنف من مبيعات الجملة ومن مبيعات التجزئة ومن الإجمالي، وكيف تتوزع مبيعاته بين القناتين."
        aside={<Segmented label="وحدة العرض" options={[{ id: "qty", label: "بالوحدات" }, { id: "sdg", label: "بالجنيه" }]} value={unit} onChange={onUnit} />}
      >
        <ItemTable table={view.table} />
      </Section>
      <Section id="d4" title="الفواتير وتركّز العملاء" hint="هل تعتمد المبيعات على عدد قليل من العملاء؟ كل شريحة وكل شريط يمثّل عميلًا.">
        <Customers invoices={view.invoices} charts={view.charts} />
      </Section>
      <Section id="d5" title="المخزون الحالي" hint="الرصيد لحظي ولا يتأثر بالتاريخ المختار، أما الحركة أسفل كل بطاقة فتخص الفترة المختارة.">
        <Stock stock={view.stock} />
      </Section>
    </div>
  );
}

export { Section };
