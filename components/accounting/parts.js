// Pieces shared by the accountant's screens. The INVOICE LOG (one agent's
// invoices of one day) is the unit everything is built around.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "../Icon";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatNumber } from "../../lib/labels";
import { TIME_ZONE } from "../../lib/companyConfig";

export const LIVE_KEYS = ["payments", "orders_car1", "orders_car2"];
export const money = (n) => formatNumber(Math.round((Number(n) || 0) * 100) / 100);
export const ROUTE_LABEL = { car1: "جملة", car2: "تجزئة" };
export const agentName = (people, route) => (people && people.length ? people.map((p) => p.name).join("، ") : `مندوب ${ROUTE_LABEL[route] || route}`);

const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
export const todayYmd = () => ymd(new Date());
export const daysAgo = (n) => ymd(new Date(Date.now() - n * 864e5));
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const weekday = (day) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
/** "سجل فواتير 2026-11-09" — the log's name, date included. */
export const logName = (day) => `سجل فواتير ${day}`;

/** Period presets for the filters. The week starts on Saturday. */
export function presetPeriod(key) {
  const today = todayYmd();
  if (key === "week") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 6 = Saturday
    return { from: daysAgo((dow + 1) % 7), to: today };
  }
  if (key === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === "90") return { from: daysAgo(89), to: today };
  return { from: daysAgo(29), to: today };
}
export const defaultPeriod = () => presetPeriod("30");

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
  paid: ["مدفوع بالكامل", "bg-green-100 text-green-800"],
  partial: ["مدفوع جزئيًا", "bg-blue-100 text-blue-800"],
  unpaid: ["غير مدفوع", "bg-amber-100 text-amber-800"],
  empty: ["بدون فواتير", "bg-gray-100 text-gray-700"],
};
export function LogStatus({ status }) {
  const [label, tone] = STATUS[status] || STATUS.unpaid;
  return <span className={`h-7 px-3 rounded-full text-sm font-bold inline-flex items-center whitespace-nowrap ${tone}`}>{label}</span>;
}

export function Money({ value, className = "" }) {
  return <span className={`num ${className}`}>{money(value)}</span>;
}

/** Paid / total bar. */
export function PaidBar({ paid, total }) {
  const pct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden" role="img" aria-label={`مدفوع ${pct}%`}>
      <span className={`block h-full rounded-full ${pct >= 100 ? "bg-green-600" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** An invoice log as a card: name with the date, agent, value, paid, remaining. */
export function LogCard({ log, people }) {
  return (
    <Link
      href={`/accounting/logs/${encodeURIComponent(log.id)}`}
      className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4 min-w-0 hover:shadow-lg active:bg-surface-2 transition-shadow"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-ink break-words">
            سجل فواتير <span className="num" dir="ltr">{log.day}</span>
          </p>
          <p className="text-ink-soft break-words">
            {weekday(log.day)} · {agentName(people, log.route)}
          </p>
        </div>
        <LogStatus status={log.status} />
      </div>
      <div>
        <p className="text-sm text-ink-soft">قيمة السجل</p>
        <p className="font-display text-3xl font-bold text-ink">
          <Money value={log.total} />
        </p>
        <p className="text-sm text-ink-soft">
          <span className="num">{log.invoices}</span> {log.invoices === 1 ? "فاتورة" : "فواتير"}
        </p>
      </div>
      <PaidBar paid={log.paid} total={log.total} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm text-ink-soft">المدفوع</p>
          <p className="text-lg font-bold text-green-700"><Money value={log.paid} /></p>
        </div>
        <div>
          <p className="text-sm text-ink-soft">المتبقي</p>
          <p className={`text-lg font-bold ${log.remaining > 0 ? "text-red-700" : "text-ink"}`}><Money value={log.remaining} /></p>
        </div>
      </div>
      {log.toDistribute > 0 && (
        <p className="rounded-xl bg-amber-50 text-amber-900 font-semibold px-3 py-2.5 flex items-center gap-2">
          <Icon name="alert" size={18} />
          دفعة بانتظار التوزيع: <Money value={log.toDistribute} />
        </p>
      )}
    </Link>
  );
}

export function Stat({ label, value, tone = "text-ink", sub }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 min-w-0">
      <p className="text-ink-soft">{label}</p>
      <p className={`font-display text-2xl font-bold mt-1 break-words ${tone}`}>{value}</p>
      {sub && <p className="text-sm text-ink-soft mt-0.5">{sub}</p>}
    </div>
  );
}

/** "هامش التشغيل" figure with its % (or a dash before the summaries are built). */
export function MarginValue({ t }) {
  if (!t || typeof t.margin !== "number") return "—";
  return (
    <>
      <Money value={t.margin} />
      {t.marginPct != null && <span className="text-base font-semibold text-ink-soft num"> ({t.marginPct}%)</span>}
    </>
  );
}

export function ErrorLine({ error, onRetry }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-red-700 bg-red-50 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
      <Icon name="alert" size={18} />
      <span className="flex-1 min-w-0 break-words">{error}</span>
      {onRetry && <button type="button" onClick={onRetry} className="underline font-semibold">إعادة المحاولة</button>}
    </p>
  );
}

/** A row of big choice chips (wraps on small screens). */
export function Choice({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`h-11 px-4 rounded-xl border-2 font-semibold ${value === v ? "border-accent bg-accent text-on-accent" : "border-line bg-white text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Dates are shown as YYYY-MM-DD across accounting, like the log names. */
export const day = (ymd) => ymd || "—";
