import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import FilterPanel from "../components/FilterPanel";
import FilterChips from "../components/FilterChips";
import PeriodTabs, { periodStartISO } from "../components/PeriodTabs";
import { PageLoading, SkeletonRows } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet } from "../lib/apiCache";

import { formatNumber } from "./../lib/labels";
import { vanFilterOptions, vanName, vanTypeOfId } from "../lib/vanNames";
const fmt = (n) => (n == null ? "—" : formatNumber(n));
const pct = (n) => (n == null ? "—" : `${n}%`);

function Stat({ label, value, strong }) {
  return (
    <div className="bg-white rounded-lg shadow p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 ${strong ? "text-lg font-bold text-gray-900" : "text-base font-medium text-gray-800"}`}>{value}</p>
    </div>
  );
}

// Supervisor-only: selling price minus supplier cost, from the live
// (locked, not cancelled) invoices, by car and period.
export default function MarginPage() {
  const { role, token, loading, logout } = useAuth(["manager"]);
  const [data, setData] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [route, setRoute] = useState("");
  const [period, setPeriod] = useState(7);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, route, period, dateFrom, dateTo]);

  async function load() {
    setFetching(true);
    setError("");
    try {
      const p = new URLSearchParams();
      p.set("from", dateFrom || periodStartISO(period));
      if (dateTo) p.set("to", dateTo);
      if (route) p.set("route", route);
      setData(await cachedGet(apiFetch, `/api/reports/margin?${p.toString()}`, token));
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  if (loading) return <PageLoading />;
  const t = data?.totals;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />     <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <BackButton />
        <h1 className="text-xl font-semibold mb-1 text-gray-800">هامش التشغيل</h1>
        <p className="text-xs text-gray-400 mb-3">
          سعر البيع − سعر المورد، من الفواتير الحالية (المقفلة وغير المقفلة)، بدون الملغاة.
        </p>

        <PeriodTabs
          value={dateFrom || dateTo ? null : period}
          onChange={(d) => {
            setPeriod(d);
            setDateFrom("");
            setDateTo("");
          }}
        />
        <FilterPanel
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          extraActiveCount={route ? 1 : 0}
        >
          <FilterChips label="العربة أو الفئة" value={route} onChange={setRoute} options={vanFilterOptions()} />
        </FilterPanel>

        {error && (
          <div className="text-red-600 text-sm mb-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={load} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {fetching || !data ? (
          <SkeletonRows count={4} />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Stat label="المبيعات (بعد الخصم)" value={fmt(t.revenue)} />
              <Stat label="تكلفة المورد" value={fmt(t.cost)} />
              <Stat label="هامش التشغيل" value={fmt(t.margin)} strong />
              {t.discount > 0 && <Stat label="خصومات الفواتير" value={fmt(t.discount)} />}
              <Stat label="نسبة الهامش" value={pct(t.marginPct)} strong />
            </div>

            {!route && Object.keys(data.byRoute).length > 1 && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {/* wholesale vs retail as a whole, then each van */}
                {["wholesale", "retail"].map((type) => {
                  const vs = Object.entries(data.byRoute).filter(([k, v]) => v && vanTypeOfId(k) === type).map(([, v]) => v);
                  if (!vs.length) return null;
                  const margin = vs.reduce((a, v) => a + (Number(v.margin) || 0), 0);
                  const costed = vs.reduce((a, v) => a + (Number(v.costedRevenue) || 0), 0);
                  return (
                    <div key={type} className="bg-accent-soft rounded-lg shadow p-3">
                      <p className="text-xs font-semibold text-accent-ink">{type === "wholesale" ? "كل الجملة" : "كل التجزئة"}</p>
                      <p className="text-base font-bold text-gray-800 mt-1">
                        {fmt(margin)} <span className="text-xs text-gray-500">({pct(costed ? Math.round((margin / costed) * 10000) / 100 : null)})</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            {!route && Object.keys(data.byRoute).length > 1 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {Object.keys(data.byRoute).sort().map(
                  (k) =>
                    data.byRoute[k] && (
                      <div key={k} className="bg-white rounded-lg shadow p-3">
                        <p className="text-xs text-gray-500">{vanName(k)}</p>
                        <p className="text-base font-medium text-gray-800 mt-1">
                          {fmt(data.byRoute[k].margin)} <span className="text-xs text-gray-400">({pct(data.byRoute[k].marginPct)})</span>
                        </p>
                      </div>
                    )
                )}
              </div>
            )}

            <div className="space-y-1 mb-4">
              <p className="text-xs text-gray-500">محسوب من {data.invoiceCount} فاتورة حالية.</p>
              {data.notFinalizedCount > 0 && (
                <p className="text-xs text-gray-500">
                  منها {data.notFinalizedCount} فاتورة لم تُقفل بعد، وقد يتغير الهامش إذا عُدّلت أو أُلغيت.
                </p>
              )}
              {t.uncostedRevenue > 0 && (
                <p className="text-xs text-amber-700">
                  مبيعات بقيمة {fmt(t.uncostedRevenue)} بدون سعر مورد مسجل، فهي غير داخلة في الهامش. حدّد تكلفة الوحدة من صفحة المنتجات.
                </p>
              )}
              {t.estimatedUnits > 0 && (
                <p className="text-xs text-amber-700">
                  {t.estimatedUnits} وحدة من فواتير قديمة حُسبت تكلفتها تقديريًا بمتوسط التكلفة الحالي.
                </p>
              )}
            </div>

            {data.products.length === 0 ? (
              <p className="text-gray-400">لا توجد فواتير في هذه الفترة.</p>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-start px-3 py-2 font-medium">المنتج</th>
                      <th className="text-center px-3 py-2 font-medium">الكمية</th>
                      <th className="text-center px-3 py-2 font-medium">المبيعات</th>
                      <th className="text-center px-3 py-2 font-medium">التكلفة</th>
                      <th className="text-center px-3 py-2 font-medium">الهامش</th>
                      <th className="text-center px-3 py-2 font-medium">النسبة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.products.map((p) => (
                      <tr key={p.productId}>
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          {p.name}
                          {p.uncostedQty > 0 && <span className="block text-xs text-amber-600">{p.uncostedQty} بدون تكلفة</span>}
                        </td>
                        <td className="text-center px-3 py-2 text-gray-600">{p.qty}</td>
                        <td className="text-center px-3 py-2 text-gray-700">{fmt(p.revenue)}</td>
                        <td className="text-center px-3 py-2 text-gray-700">{fmt(p.cost)}</td>
                        <td className={`text-center px-3 py-2 font-medium ${p.margin < 0 ? "text-red-600" : "text-gray-900"}`}>
                          {fmt(p.margin)}
                        </td>
                        <td className="text-center px-3 py-2 text-gray-600">{pct(p.marginPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-900 text-white">
                    <tr>
                      <td className="px-3 py-2 font-medium">الإجمالي</td>
                      <td className="text-center px-3 py-2">{data.products.reduce((s, p) => s + p.qty, 0)}</td>
                      <td className="text-center px-3 py-2">{fmt(t.revenue)}</td>
                      <td className="text-center px-3 py-2">{fmt(t.cost)}</td>
                      <td className="text-center px-3 py-2 font-bold">{fmt(t.margin)}</td>
                      <td className="text-center px-3 py-2">{pct(t.marginPct)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
