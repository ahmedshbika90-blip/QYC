// Pieces shared by the accountant's screens (agents, logs, reports).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "../Icon";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDate, formatNumber } from "../../lib/labels";

import { TIME_ZONE } from "../../lib/companyConfig";
export const LIVE_KEYS = ["payments", "orders_car1", "orders_car2"];
export const money = (n) => formatNumber(Math.round((Number(n) || 0) * 100) / 100);
export const day = (ymd) => (ymd ? formatDate(`${ymd}T12:00:00Z`) : "—");
export const ROUTE_LABEL = { car1: "جملة", car2: "تجزئة" };
export const agentName = (people, route) => (people && people.length ? people.map((p) => p.name).join("، ") : `مندوب ${ROUTE_LABEL[route] || route}`);

const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
export const daysAgo = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
export const defaultPeriod = () => ({ from: daysAgo(29), to: todayYmd() });

/** GET with the shared cache, refreshed live when payments or invoices change. */
export function useApi(token, url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!token || !url) return;
    setError("");
    try {
      setData(await cachedGet(apiFetch, url, token));
    } catch (err) {
      setError(err.message);
    }
  }, [token, url]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  useLiveRefresh(token, LIVE_KEYS, load);
  return { data, error, reload: load, setData };
}

export const STATUS = {
  paid: ["مدفوع", "bg-green-100 text-green-700"],
  partial: ["مدفوع جزئيًا", "bg-blue-100 text-blue-700"],
  unpaid: ["غير مدفوع", "bg-amber-100 text-amber-700"],
  empty: ["بدون فواتير", "bg-gray-100 text-gray-600"],
};
export function LogStatus({ status }) {
  const [label, tone] = STATUS[status] || STATUS.unpaid;
  return <span className={`h-6 px-2.5 rounded-full text-xs font-bold inline-flex items-center whitespace-nowrap ${tone}`}>{label}</span>;
}

export function Money({ value, className = "" }) {
  return <span className={`num ${className}`}>{money(value)}</span>;
}

/** One log row: day, van/agent, invoices, total, paid, remaining, status → the log page. */
export function LogRow({ log, people, showAgent = true }) {
  const pct = log.total ? Math.min(100, Math.round((log.paid / log.total) * 100)) : 0;
  return (
    <li>
      <Link href={`/accounting/logs/${encodeURIComponent(log.id)}`} className="block px-4 py-3.5 active:bg-surface-2 hover:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink">{day(log.day)}</p>
            <p className="text-sm text-ink-soft mt-0.5 truncate">
              {showAgent && <>{agentName(people, log.route)} · </>}
              <span className="num">{log.invoices}</span> {log.invoices === 1 ? "فاتورة" : "فواتير"}
            </p>
          </div>
          <div className="text-end shrink-0">
            <p className="font-bold text-ink"><Money value={log.total} /></p>
            <LogStatus status={log.status} />
          </div>
        </div>
        <div className="mt-2.5 h-2 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-ink-soft">مدفوع <Money value={log.paid} className="font-semibold text-ink" /></span>
          {log.remaining > 0 && <span className="text-ink-soft">متبقٍ <Money value={log.remaining} className="font-bold text-red-700" /></span>}
          {log.toDistribute > 0 && <span className="text-amber-700 font-semibold">بانتظار التوزيع <Money value={log.toDistribute} /></span>}
          {log.credit > 0 && <span className="text-blue-700 font-semibold">رصيد زائد <Money value={log.credit} /></span>}
          {typeof log.margin === "number" && (
            <span className="text-ink-soft">هامش التشغيل <Money value={log.margin} className={`font-semibold ${log.margin < 0 ? "text-red-700" : "text-green-700"}`} />{log.marginPct != null && <span className="num"> ({log.marginPct}%)</span>}</span>
          )}
        </div>
      </Link>
    </li>
  );
}

export function Stat({ label, value, tone = "text-ink", sub }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 min-w-0">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className={`font-display text-2xl font-bold mt-1 truncate ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-ink-soft mt-0.5">{sub}</p>}
    </div>
  );
}

/** "هامش التشغيل" figure with its % (or a dash before the summaries are built). */
export function MarginValue({ t }) {
  if (!t || typeof t.margin !== "number") return "—";
  return (
    <>
      <Money value={t.margin} />
      {t.marginPct != null && <span className="text-base font-semibold text-ink-soft num"> {t.marginPct}%</span>}
    </>
  );
}

export function ErrorLine({ error, onRetry }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
      <Icon name="alert" size={18} />
      <span className="flex-1">{error}</span>
      {onRetry && <button type="button" onClick={onRetry} className="underline font-semibold">إعادة المحاولة</button>}
    </p>
  );
}
