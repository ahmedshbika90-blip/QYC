import { V, fmt } from "../lib/dashboardView";

// Small, dependency-free SVG charts for the executive dashboard. Colours
// come from the .dash palette (styles/globals.css) so they follow light /
// dark mode: wholesale = green, retail = navy, products = cool tones.

const iso = (s) => "\u2066" + s + "\u2069"; // keep "58%" in one piece inside Arabic text
export const pctText = (x) => iso((Math.round((Number(x) || 0) * 10) / 10).toFixed(1) + "%");

function arcPath(cx, cy, r, start, end) {
  // angles in turns (0..1), clockwise from 12 o'clock
  const a0 = (start - 0.25) * 2 * Math.PI;
  const a1 = (end - 0.25) * 2 * Math.PI;
  const large = end - start > 0.5 ? 1 : 0;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function Legend({ items }) {
  return (
    <ul className="flex flex-col gap-2.5 w-full">
      {items.map((it) => (
        <li key={it.key} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: it.color }} />
            <span className="text-ink font-semibold truncate">{it.label}</span>
          </span>
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="dn font-bold text-ink">{it.share}</span>
            <span className="dn text-xs text-muted">{it.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Ring with the grand total in the middle. segments: [{ key, label, value, color }] */
export function DonutChart({ segments, centerValue, centerLabel, ariaLabel }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-5">
      <svg viewBox="0 0 140 140" width="168" height="168" role="img" aria-label={ariaLabel}>
        <circle cx="70" cy="70" r={R} fill="none" stroke={V("ln")} strokeWidth="18" />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, len - (segments.length > 1 && len > 2 ? 1.5 : 0))} ${C}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 70 70)"
              />
            );
            acc += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" className="dn" fontSize="22" fontWeight="700" fill="rgb(var(--gray-900))">{centerValue}</text>
        <text x="70" y="88" textAnchor="middle" fontSize="11" fill="rgb(var(--gray-500))">{centerLabel}</text>
      </svg>
      <Legend items={segments.map((s) => ({ ...s, share: pctText(total ? (s.value / total) * 100 : 0), value: fmt(s.value) }))} />
    </div>
  );
}

/** Filled pie. segments: [{ key, label, value, color }] */
export function PieChart({ segments, ariaLabel }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const live = segments.filter((s) => s.value > 0);
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-5">
      <svg viewBox="0 0 140 140" width="168" height="168" role="img" aria-label={ariaLabel}>
        {total === 0 ? (
          <circle cx="70" cy="70" r="62" fill={V("ln")} />
        ) : live.length === 1 ? (
          <circle cx="70" cy="70" r="62" fill={live[0].color} />
        ) : (
          live.map((s) => {
            const start = acc;
            acc += s.value / total;
            return <path key={s.key} d={arcPath(70, 70, 62, start, acc)} fill={s.color} stroke="rgb(var(--white))" strokeWidth="2" />;
          })
        )}
      </svg>
      <Legend items={segments.map((s) => ({ ...s, share: pctText(total ? (s.value / total) * 100 : 0), value: fmt(s.value) }))} />
    </div>
  );
}

/** Horizontal bars, biggest first. rows: [{ id, label, value, share, color, sub? }] */
export function BarList({ rows, unit, empty = "لا توجد مبيعات في هذه الفترة" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted py-10 text-center m-0">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-ink min-w-0 truncate" title={r.label}>{r.label}</span>
            <span className="shrink-0 flex items-baseline gap-2">
              <span className="dn font-bold text-ink">{fmt(r.value)}</span>
              <span className="text-xs text-muted">{unit}</span>
              <span className="dn text-xs font-semibold text-muted w-12 text-end">{pctText(r.share)}</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden flex">
            <span className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          {r.sub && <div className="text-xs text-muted">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Two-part horizontal split bar. */
export function Split({ a, b, aColor = V("w"), bColor = V("r"), h = 12 }) {
  return (
    <div className="flex overflow-hidden" style={{ height: h, borderRadius: h / 2, background: "rgb(var(--gray-100))" }}>
      <div style={{ flex: `${Math.max(a, 0.0001)} 1 0%`, background: aColor }} />
      <div style={{ flex: `${Math.max(b, 0.0001)} 1 0%`, background: bColor, marginInlineStart: 2 }} />
    </div>
  );
}
