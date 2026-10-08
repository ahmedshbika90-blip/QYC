import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "../Icon";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { groupByItem, topMoves } from "../../lib/competitorView";
import { formatDate, formatNumber } from "../../lib/labels";
import { Change } from "./CompetitorBits";

// Executive overview: the last 30 days of competitor prices in one card —
// the biggest moves if there are any, otherwise the latest prices — with a
// link to the full page. Loaded on demand, under the sales figures.
const day = (ymd) => formatDate(`${ymd}T12:00:00Z`);

export default function CompetitorsCard({ token }) {
  const [entries, setEntries] = useState(null);
  const load = useCallback(async () => {
    try {
      setEntries((await cachedGet(apiFetch, "/api/competitors?days=30", token)).entries);
    } catch {
      setEntries([]);
    }
  }, [token]);
  useEffect(() => {
    if (token) load();
  }, [token, load]);
  useLiveRefresh(token, ["competitors"], load);

  const rows = useMemo(() => {
    const groups = groupByItem(entries || []);
    const moves = topMoves(groups, 4);
    if (moves.length) return moves;
    return groups.slice(0, 4).map((g) => ({ ...g.rows[0], item: g.item, weight: g.weight, key: g.key }));
  }, [entries]);

  if (!entries || entries.length === 0) return null;
  return (
    <section aria-labelledby="cp-card-title" className="exec-card p-0 overflow-hidden">
      <div className="px-4 md:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
            <Icon name="tag" size={20} />
          </span>
          <div className="min-w-0">
            <h2 id="cp-card-title" className="font-display text-lg font-bold text-ink">أسعار المنافسين</h2>
            <p className="text-xs text-muted">آخر 30 يومًا · آخر تحديث {day(entries[0].date)}</p>
          </div>
        </div>
        <Link href="/executive/competitors" className="shrink-0 h-10 px-3 rounded-xl text-sm font-semibold text-accent-ink hover:bg-accent-soft flex items-center gap-1">
          عرض الكل
          <Icon name="chevronLeft" size={16} className="rtl-flip" />
        </Link>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={`${r.key}-${r.company}`} className="px-4 md:px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">
                {r.item} {r.weight && <span className="text-xs text-accent-ink">{r.weight}</span>}
              </p>
              <p className="text-xs text-muted truncate">{[r.company, r.route, day(r.date)].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="text-end shrink-0">
              <p className="num font-bold text-ink">{formatNumber(r.price)}</p>
              <Change row={r} compact />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
