import { useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { ROUTE_LABELS, formatDate } from "../../lib/labels";

export default function SalesReport() {
  const { role, token, loading, logout } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [routeFilter, setRouteFilter] = useState("all");
  const [report, setReport] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  async function generate(e) {
    e.preventDefault();
    setError("");
    setFetching(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (role === "supervisor" && routeFilter !== "all") params.set("route", routeFilter);

      const res = await apiFetch(`/api/reports/sales?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  function printReport() {
    window.print();
  }

  // Pivot: one column per distinct product across every client, one row
  // per client, cell = quantity that client bought of that product. Far
  // easier to scan for a daily volume check than a separate table per
  // client. Keyed by productId (falling back to name) so two different
  // products that happen to share a name never collide into one column.
  const { columns, rows, columnTotals } = useMemo(() => {
    if (!report) return { columns: [], rows: [], columnTotals: {} };

    const colMap = new Map();
    for (const c of report.clients) {
      for (const it of c.items) {
        const key = it.productId || it.name;
        if (!colMap.has(key)) colMap.set(key, { key, name: it.name, unit: it.unit });
      }
    }
    const columns = [...colMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));

    const columnTotals = {};
    columns.forEach((col) => (columnTotals[col.key] = 0));

    const rows = report.clients.map((c) => {
      const cells = {};
      for (const it of c.items) {
        const key = it.productId || it.name;
        cells[key] = it.qty;
        columnTotals[key] += it.qty;
      }
      return { client: c, cells };
    });

    return { columns, rows, columnTotals };
  }, [report]);

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="no-print">
        <Nav role={role} logout={logout} />
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <div className="no-print bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
          <h1 className="text-xl font-semibold mb-4 text-gray-800">تقرير المبيعات</h1>

          <form onSubmit={generate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">من تاريخ</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border rounded-lg px-3 h-12 text-base"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border rounded-lg px-3 h-12 text-base"
              />
            </div>
            {role === "supervisor" && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">المسار</label>
                <select
                  value={routeFilter}
                  onChange={(e) => setRouteFilter(e.target.value)}
                  className="w-full border rounded-lg px-3 h-12 text-base"
                >
                  <option value="all">كل المسارات</option>
                  <option value="car1">السيارة ١</option>
                  <option value="car2">السيارة ٢</option>
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={fetching}
              className="sm:col-span-3 bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {fetching && <Spinner className="w-4 h-4" />}
              {fetching ? "جارٍ إنشاء التقرير..." : "إنشاء التقرير"}
            </button>
          </form>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

          <p className="text-xs text-gray-400 mt-3">
            اترك التواريخ فارغة لعرض كل السجل. الطلبات الملغاة لا تُحتسب ضمن التقرير.
          </p>
        </div>

        {report && (
          <div className="bg-white rounded-lg shadow p-4 sm:p-6 print:shadow-none print:p-0">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">تقرير المبيعات</h2>
                <p className="text-sm text-gray-500">
                  {report.route === "all"
                    ? "كل المسارات"
                    : ROUTE_LABELS[report.route] || report.route}
                </p>
                <p className="text-sm text-gray-500">
                  {report.from ? formatDate(report.from) : "البداية"}
                  {" — "}
                  {report.to ? formatDate(report.to) : "الآن"}
                </p>
              </div>
              <button
                onClick={printReport}
                className="no-print text-sm bg-gray-900 text-white rounded-lg px-4 min-h-[44px] shrink-0"
              >
                طباعة / حفظ PDF
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="text-gray-400">لا توجد مبيعات مسلَّمة في هذه الفترة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-800">
                      <th className="sticky start-0 bg-white text-start font-semibold text-gray-700 px-3 py-2 whitespace-nowrap print:px-2 print:py-1">
                        العميل
                      </th>
                      {columns.map((col) => (
                        <th
                          key={col.key}
                          className="text-center font-semibold text-gray-700 px-3 py-2 whitespace-nowrap print:px-2 print:py-1"
                        >
                          {col.name}
                          {col.unit && <span className="block text-xs font-normal text-gray-400">({col.unit})</span>}
                        </th>
                      ))}
                      <th className="text-center font-semibold text-gray-700 px-3 py-2 whitespace-nowrap bg-gray-50 print:px-2 print:py-1">
                        إجمالي الوحدات
                      </th>
                      <th className="text-center font-semibold text-gray-700 px-3 py-2 whitespace-nowrap bg-gray-50 print:px-2 print:py-1">
                        إجمالي السعر
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ client: c, cells }, i) => (
                      <tr key={c.clientId} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                        <td className="sticky start-0 bg-inherit px-3 py-2 print:px-2 print:py-1">
                          <p className="text-gray-800 font-medium whitespace-nowrap">{c.name}</p>
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            <span className="tabular-ltr">#{c.clientId}</span> · {c.location}
                          </p>
                        </td>
                        {columns.map((col) => (
                          <td key={col.key} className="text-center px-3 py-2 text-gray-700 print:px-2 print:py-1">
                            {cells[col.key] ?? <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                        <td className="text-center px-3 py-2 font-medium text-gray-800 bg-gray-50/70 print:px-2 print:py-1">
                          {c.totalUnits}
                        </td>
                        <td className="text-center px-3 py-2 font-medium text-gray-900 bg-gray-50/70 print:px-2 print:py-1">
                          {c.totalPrice}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-800 font-semibold">
                      <td className="sticky start-0 bg-white px-3 py-2 text-gray-800 whitespace-nowrap print:px-2 print:py-1">
                        الإجمالي ({rows.length} عميل)
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="text-center px-3 py-2 text-gray-800 print:px-2 print:py-1">
                          {columnTotals[col.key]}
                        </td>
                      ))}
                      <td className="text-center px-3 py-2 text-gray-900 bg-gray-100 print:px-2 print:py-1">
                        {report.grandTotalUnits}
                      </td>
                      <td className="text-center px-3 py-2 text-gray-900 bg-gray-100 print:px-2 print:py-1">
                        {report.grandTotalPrice}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
