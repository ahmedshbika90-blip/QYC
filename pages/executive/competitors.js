import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import FilterChips from "../../components/FilterChips";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { cachedGet } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { groupBySku, distinct } from "../../lib/competitorView";
import { formatDate, formatNumber } from "../../lib/labels";

// Competitor prices for the executive (view only). Entered in the market by
// the sales supervisor; updates live. Two views of the same entries:
//   by product — per SKU, each company's latest price, cheapest first, and
//                how it moved since that company's previous entry
//   all entries — the raw log, newest first
const API = "/api/competitors";
const day = (ymd) => formatDate(`${ymd}T12:00:00Z`);
const Card = ({ className = "", children }) => <div className={`exec-card min-w-0 ${className}`}>{children}</div>;

function Change({ row }) {
  if (row.change == null) return <span className="text-xs text-muted">أول إدخال</span>;
  if (row.change === 0) return <span className="text-xs text-muted">بدون تغيير</span>;
  const up = row.change > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-red-700" : "text-green-700"}`}>
      <Icon name={up ? "trendUp" : "trendDown"} size={14} />
      <span className="num" dir="ltr">
        {up ? "+" : "−"}
        {formatNumber(Math.abs(row.change))}
      </span>
      {row.changePct != null && <span className="num">({Math.abs(row.changePct)}%)</span>}
    </span>
  );
}

function SkuGroup({ g }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex flex-wrap items-start justify-between gap-2 border-b border-line">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">{g.item}</h2>
          <p className="text-xs text-muted mt-0.5">
            <span className="num bg-surface-2 rounded px-1.5 py-0.5" dir="ltr">{g.sku}</span>
            <span className="ms-2">آخر تحديث {day(g.latestDate)}</span>
          </p>
        </div>
        {g.rows.length > 1 && (
          <p className="text-xs text-muted text-end">
            المدى <span className="num font-semibold text-ink">{formatNumber(g.min)}</span> – <span className="num font-semibold text-ink">{formatNumber(g.max)}</span>
          </p>
        )}
      </div>
      <ul className="divide-y divide-line">
        {g.rows.map((r, i) => (
          <li key={r.company} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">
                {r.company}
                {i === 0 && g.rows.length > 1 && <span className="ms-2 text-[11px] font-semibold text-accent-ink bg-accent-soft rounded-md px-1.5 py-0.5">الأقل سعرًا</span>}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {day(r.date)}
                {r.prev && <> · كان <span className="num">{formatNumber(r.prev.price)}</span> في {day(r.prev.date)}</>}
              </p>
            </div>
            <div className="text-end shrink-0">
              <p className="num text-lg font-bold text-ink">{formatNumber(r.price)}</p>
              <Change row={r} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ExecutiveCompetitors() {
  const { role, token, loading, logout } = useAuth(["executive", "manager"]);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [view, setView] = useState("sku");

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await cachedGet(apiFetch, API, token);
      setEntries(d.entries);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);
  useEffect(() => {
    if (token) load();
  }, [token, load]);
  useLiveRefresh(token, ["competitors"], load);

  const companies = useMemo(() => distinct(entries || [], "company"), [entries]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (entries || []).filter((e) => {
      if (company && e.company !== company) return false;
      if (!s) return true;
      return [e.company, e.item, e.sku].some((v) => String(v || "").toLowerCase().includes(s));
    });
  }, [entries, q, company]);
  const groups = useMemo(() => groupBySku(filtered), [filtered]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-4xl mx-auto px-4 pt-5 pb-8 sm:px-8 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">أسعار المنافسين</h1>
          <p className="text-sm text-muted mt-1">
            {entries ? (
              entries.length ? (
                <>
                  <span className="num">{groupBySku(entries).length}</span> صنف · <span className="num">{companies.length}</span> شركة · آخر إدخال {day(entries[0].date)} — يُدخلها مشرف المبيعات من السوق.
                </>
              ) : (
                "يُدخلها مشرف المبيعات من السوق."
              )
            ) : (
              " "
            )}
          </p>
        </div>

        <div className="relative">
          <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الصنف أو الشركة أو SKU..." className="h-12 w-full rounded-xl border border-line bg-white ps-10 pe-3 text-base" />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          {companies.length > 0 && <FilterChips label="الشركة" value={company} onChange={setCompany} options={companies.map((c) => [c, c])} />}
          <div role="radiogroup" aria-label="طريقة العرض" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-2 sm:w-64">
            {[["sku", "حسب الصنف"], ["log", "كل الإدخالات"]].map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`h-10 rounded-lg text-sm ${view === v ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" className="text-red-600 text-sm flex items-center gap-2">
            <span>{error}</span>
            <button type="button" onClick={load} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {!entries ? (
          !error && <SkeletonRows count={5} />
        ) : entries.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="font-semibold text-ink">لا توجد أسعار بعد</p>
            <p className="text-sm text-muted mt-1">ستظهر هنا فور إدخال مشرف المبيعات لأول سعر.</p>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-muted">لا توجد نتائج مطابقة.</p>
        ) : view === "sku" ? (
          <div className="grid gap-3 md:grid-cols-2 items-start">
            {groups.map((g) => <SkuGroup key={g.key} g={g} />)}
          </div>
        ) : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-xs text-muted border-b border-line">
                  <th className="px-4 py-3 text-start font-semibold">التاريخ</th>
                  <th className="px-4 py-3 text-start font-semibold">الشركة</th>
                  <th className="px-4 py-3 text-start font-semibold">الصنف</th>
                  <th className="px-4 py-3 text-start font-semibold">SKU</th>
                  <th className="px-4 py-3 text-end font-semibold">السعر</th>
                  <th className="px-4 py-3 text-start font-semibold">أدخله</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{day(e.date)}</td>
                    <td className="px-4 py-3">{e.company}</td>
                    <td className="px-4 py-3">{e.item}</td>
                    <td className="px-4 py-3 num" dir="ltr" style={{ textAlign: "start" }}>{e.sku}</td>
                    <td className="px-4 py-3 text-end num font-semibold text-ink">{formatNumber(e.price)}</td>
                    <td className="px-4 py-3 text-muted">{e.createdByName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
