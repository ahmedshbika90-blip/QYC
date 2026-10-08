// Pieces shared by the executive dashboard's tabs (pages/executive/index.js
// and the tabs loaded on demand from components/exec/).
import { useEffect, useState } from "react";
import Icon from "../Icon";
import DateFields from "../DateFields";
import { pctText } from "../ExecCharts";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { rangeText, todayYmd, V } from "../../lib/dashboardView";

import { UTC_OFFSET } from "../../lib/companyConfig";
export const UNIT = "وحدة";
// Day: Alwafi maroon / Chipsiano orange. Night: the original palette (the
// brand variables are unset in night mode, so the fallback colour applies).
export const GROUP_COLOR = {
  alwafi: "rgb(var(--d-brand-alwafi, var(--d-p1)))",
  snacks: "rgb(var(--d-brand-snacks, var(--d-p3)))",
  other: V("p5"),
};
export const PRODUCT_COLORS = ["p1", "p3", "p2", "p4", "p5", "p6"];
// Per-item bars: by family in day mode, the original rotating palette at night.
export const productColor = (group, i) => {
  const fallback = `var(--d-${PRODUCT_COLORS[i % PRODUCT_COLORS.length]})`;
  if (group === "alwafi") return `rgb(var(--d-brand-alwafi, ${fallback}))`;
  if (group === "snacks") return `rgb(var(--d-brand-snacks, ${fallback}))`;
  return `rgb(${fallback})`;
};
// SDG amounts: thousands separators, no forced decimals (100,000).
export const money = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const Card = ({ className = "", children }) => <div className={`exec-card min-w-0 ${className}`}>{children}</div>;

export function useGet(token, url, liveKeys) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  async function load() {
    if (!token || !url) return;
    setBusy(true);
    try {
      setData(await cachedGet(apiFetch, url, token));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, url]);
  useLiveRefresh(token, liveKeys, load);
  return { data, error, busy, reload: load };
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm bg-surface-2 text-ink">
      <span className="flex items-center gap-2"><Icon name="alert" size={18} />{error}</span>
      <button type="button" onClick={onRetry} className="font-semibold underline shrink-0">إعادة المحاولة</button>
    </div>
  );
}

/* ── period picker: quick choices + custom dates ─────────────────────── */

export const addDaysYmd = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function presets() {
  const t = todayYmd();
  return [
    { id: "today", label: "اليوم", from: t, to: t },
    { id: "yesterday", label: "أمس", from: addDaysYmd(t, -1), to: addDaysYmd(t, -1) },
    { id: "7", label: "آخر 7 أيام", from: addDaysYmd(t, -6), to: t },
    { id: "30", label: "آخر 30 يومًا", from: addDaysYmd(t, -29), to: t },
    { id: "month", label: "هذا الشهر", from: `${t.slice(0, 8)}01`, to: t },
  ];
}

export function PeriodPicker({ range, onChange, title = "الفترة" }) {
  const list = presets();
  const match = list.find((p) => p.from === range.from && p.to === range.to);
  const [custom, setCustom] = useState(!match);
  const today = todayYmd();
  const period = { fromYmd: range.from, toYmd: range.to, from: `${range.from}T12:00:00${UTC_OFFSET}`, ...(range.from === range.to ? {} : { to: `${range.to}T12:00:00${UTC_OFFSET}` }) };
  return (
    <div className="exec-card p-4 md:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink flex items-center gap-2">
          <Icon name="calendar" size={18} className="text-accent-ink" />
          {title}
        </p>
        <p className="text-sm text-muted">{rangeText(period)}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="اختيار الفترة">
        {list.map((p) => {
          const on = !custom && match?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setCustom(false);
                onChange(p.from, p.to);
              }}
              className={`shrink-0 h-10 px-4 rounded-full text-sm border transition-colors ${on ? "bg-accent text-on-accent border-accent font-bold shadow-sm" : "bg-white text-ink-soft border-line hover:border-accent"}`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={`shrink-0 h-10 px-4 rounded-full text-sm border flex items-center gap-1.5 ${custom ? "bg-accent text-on-accent border-accent font-bold shadow-sm" : "bg-white text-ink-soft border-line hover:border-accent"}`}
        >
          <Icon name="calendar" size={15} />
          مخصص
        </button>
      </div>
      {custom && (
        <DateFields
          className="sm:max-w-md"
          from={range.from}
          to={range.to}
          max={today}
          onFrom={(v) => v && onChange(v > range.to ? range.to : v, range.to)}
          onTo={(v) => v && onChange(range.from, v < range.from ? range.from : v)}
        />
      )}
    </div>
  );
}

/* ── headline KPI ───────────────────────────────────────────────────── */

export function Delta({ change }) {
  if (change === null) return <span className="text-xs font-semibold text-accent-ink bg-accent-soft rounded-full px-2 h-6 inline-flex items-center">جديد</span>;
  if (!change) return <span className="text-xs text-muted">بدون تغيير</span>;
  const up = change > 0;
  return (
    <span className={`text-xs font-bold rounded-full px-2 h-6 inline-flex items-center gap-1 ${up ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="dn">{pctText(Math.abs(change))}</span>
    </span>
  );
}

export function Kpi({ icon, label, value, unit, change, tone = "accent" }) {
  const tones = { accent: "bg-accent-soft text-accent-ink", w: "", r: "" };
  return (
    <div className="exec-card exec-lift p-4 md:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tones[tone] || tones.accent}`} style={tone !== "accent" ? { background: V(tone + "s"), color: V(tone) } : undefined}>
          <Icon name={icon} size={20} />
        </span>
        <Delta change={change} />
      </div>
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-semibold text-muted">{label}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 min-w-0">
          <span className="dn font-display fig-sm font-bold text-ink">{value}</span>
          {unit && <span className="text-xs text-muted">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

export function Stat({ label, value, unit, color, sub }) {
  return (
    <div className="rounded-xl px-4 py-3.5 min-w-0" style={{ background: color ? V(color + "s") : "rgb(var(--gray-100))" }}>
      <div className="text-[0.8125rem] font-semibold" style={{ color: color ? V(color) : "rgb(var(--gray-600))" }}>{label}</div>
      <div className="mt-1 min-w-0"><span className="dn fig-sm font-bold text-ink">{value}</span>{unit && <span className="text-xs text-muted ms-1.5">{unit}</span>}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
