import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet, invalidate } from "../lib/apiCache";
import { formatNumber } from "../lib/labels";

// Today's operating margin for the signed-in agent, from TODAY'S CURRENT
// invoices (not only finalized ones), so it moves as the day goes — and
// can change if an invoice is edited or cancelled. Computed on the server
// by the same rules as the supervisor's margin page (lib/marginCalc.js);
// the agent receives the total only, never a per-product cost.
export default function TodayMargin({ token, refreshKey }) {
  const [m, setM] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const url = `/api/reports/sales?from=${encodeURIComponent(start.toISOString())}`;
    invalidate("/api/reports/sales");
    cachedGet(apiFetch, url, token)
      .then((d) => { setM(d.margin || null); setFailed(false); })
      .catch(() => setFailed(true));
  }, [token, refreshKey]);

  const value = m ? m.margin : null;
  const negative = typeof value === "number" && value < 0;
  // The amount gets the full width on its own line (formatNumber adds the
  // currency, so real daily totals are long); the % sits beside the label.
  return (
    <div data-no-spotlight className="bg-white rounded-2xl shadow min-h-[4.5rem] px-3.5 py-2.5 flex flex-col justify-center gap-0.5 min-w-0" aria-live="polite">
      <p className="text-xs text-muted flex items-center gap-1.5 whitespace-nowrap">
        هامش التشغيل اليوم
        {m && m.marginPct != null && (
          <span className={`num font-bold ${negative ? "text-red-600" : "text-accent-ink"}`}>{m.marginPct}%</span>
        )}
      </p>
      <p
        className={`num text-[1.0625rem] leading-tight font-bold tabular-ltr text-start whitespace-nowrap truncate ${
          negative ? "text-red-600" : "text-ink"
        }`}
        title={typeof value === "number" ? formatNumber(value) : undefined}
      >
        {failed ? "—" : value == null ? "…" : formatNumber(value)}
      </p>
    </div>
  );
}
