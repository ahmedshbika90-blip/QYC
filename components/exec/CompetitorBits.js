// Small pieces shared by the competitor-price views (executive page and
// the overview card).
import Icon from "../Icon";
import { formatNumber } from "../../lib/labels";

export function Sparkline({ values, up }) {
  if (!values || values.length < 2) return null;
  const w = 64, h = 22, min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${max === min ? h / 2 : h - 2 - ((v - min) / (max - min)) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className={up ? "text-red-500" : "text-green-600"}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Change({ row, compact }) {
  if (row.change == null) return <span className="text-xs text-muted">أول سعر</span>;
  if (row.change === 0) return <span className="text-xs text-muted">بدون تغيير</span>;
  const up = row.change > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 h-6 ${up ? "text-red-700 bg-red-50" : "text-green-700 bg-green-50"}`}>
      <Icon name={up ? "trendUp" : "trendDown"} size={13} />
      {!compact && (
        <span className="num" dir="ltr">
          {up ? "+" : "−"}
          {formatNumber(Math.abs(row.change))}
        </span>
      )}
      {row.changePct != null && <span className="num">{Math.abs(row.changePct)}%</span>}
    </span>
  );
}

