import { useMemo, useRef, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useRequestId } from "../../lib/useRequestId";
import { shareElementAsPdf } from "../../lib/sharePdf";
import { ROUTE_LABELS, formatDate } from "../../lib/labels";

export default function SalesReport() {
  const { role, token, loading, logout } = useAuth();
  // Defaults to today — the everyday use is a daily report, and a one-day
  // range is the cheapest possible query. Either date can still be changed
  // or cleared for a longer period.
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [routeFilter, setRouteFilter] = useState("all");
  const [report, setReport] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const lockIds = useRequestId();
  const [error, setError] = useState("");
  const reportRef = useRef(null);

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

  // Renders the report area to an image (via html2canvas) and embeds that
  // image in a single-page PDF (via jsPDF) — this sidesteps Arabic text
  // rendering entirely, since jsPDF's own text drawing doesn't shape
  // Arabic correctly. What ends up in the PDF is a picture of exactly
  // what's on screen, which the browser already renders correctly.
  //
  // The PDF is then handed straight to the phone's native share sheet
  // (WhatsApp, etc.) via the Web Share API — one tap, no separate
  // download-then-attach step. Falls back to a plain download on
  // browsers/desktops that don't support sharing files.
  async function shareReport() {
    const count = report.orderCount ?? 0;
    if (
      !confirm(
        `مشاركة التقرير تقفل فواتيره (${count}) من التعديل والإلغاء — أي تغيير بعدها يحتاج موافقة المشرف. متابعة؟`
      )
    )
      return;
    setSharing(true);
    setError("");

    // Lock first, share second: if the lock can't be confirmed (e.g. no
    // connection), the report is NOT shared — so a report that went out can
    // never have invoices that are still freely editable.
    try {
      const lockBody = { from: report.from, to: report.to, route: report.route === "all" ? "" : report.route };
      const res = await apiFetch("/api/reports/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...lockBody, requestId: lockIds.idFor(lockBody) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      lockIds.reset();
      invalidate("/api/orders/list");
    } catch (err) {
      setError(`لم تتم المشاركة: ${err.message}`);
      setSharing(false);
      return;
    }

    try {
      await shareElementAsPdf(reportRef.current, { fileName: "تقرير-المبيعات.pdf", title: "تقرير المبيعات" });
    } catch {
      setError("تم قفل الفواتير، لكن تعذر إنشاء ملف التقرير للمشاركة. حاول المشاركة مرة أخرى.");
    } finally {
      setSharing(false);
    }
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
      <Nav role={role} logout={logout} />

      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
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
            الافتراضي تقرير اليوم. اترك التواريخ فارغة لعرض كل السجل (أبطأ). الفواتير الملغاة لا تُحتسب.
          </p>
        </div>

        {report && (
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex justify-end mb-2">
              <button
                onClick={shareReport}
                disabled={sharing}
                className="text-sm bg-gray-900 text-white rounded-lg px-4 min-h-[44px] shrink-0 flex items-center gap-2 disabled:opacity-50"
              >
                {sharing && <Spinner className="w-4 h-4" />}
                {sharing ? "جارٍ التجهيز..." : "مشاركة"}
              </button>
            </div>

            <div ref={reportRef} className="bg-white">
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-900">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">تقرير المبيعات</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {report.route === "all"
                      ? "كل المسارات"
                      : ROUTE_LABELS[report.route] || report.route}
                    {" · "}
                    {report.from ? formatDate(report.from) : "البداية"}
                    {" — "}
                    {report.to ? formatDate(report.to) : "الآن"}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-lg font-bold text-gray-900">مسار</p>
                  <p className="text-xs text-gray-400">Masar</p>
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="text-gray-400">لا توجد مبيعات في هذه الفترة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-900 bg-gray-50">
                        <th className="sticky start-0 z-10 bg-gray-50 text-start font-semibold text-gray-700 px-4 py-3 whitespace-nowrap">
                          العميل
                        </th>
                        {columns.map((col, i) => (
                          <th
                            key={col.key}
                            className={`text-center font-semibold text-gray-700 px-4 py-3 whitespace-nowrap ${
                              i === 0 ? "border-e border-gray-200" : ""
                            }`}
                          >
                            {col.name}
                            {col.unit && <span className="block text-xs font-normal text-gray-400">({col.unit})</span>}
                          </th>
                        ))}
                        <th className="text-center font-semibold text-gray-700 px-4 py-3 whitespace-nowrap bg-gray-100 border-s border-gray-200">
                          إجمالي الوحدات
                        </th>
                        <th className="text-center font-semibold text-gray-700 px-4 py-3 whitespace-nowrap bg-gray-100">
                          إجمالي السعر
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ client: c, cells }, i) => (
                        <tr key={c.clientId} className={i % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                          <td
                            className={`sticky start-0 z-10 px-4 py-3 ${
                              i % 2 === 1 ? "bg-gray-50" : "bg-white"
                            }`}
                          >
                            <p className="text-gray-800 font-medium whitespace-nowrap">{c.name}</p>
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              <span className="tabular-ltr">#{c.clientId}</span> · {c.location}
                            </p>
                          </td>
                          {columns.map((col, ci) => (
                            <td
                              key={col.key}
                              className={`text-center px-4 py-3 text-gray-700 ${
                                ci === 0 ? "border-e border-gray-200" : ""
                              }`}
                            >
                              {cells[col.key] ?? <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td
                            className={`text-center px-4 py-3 font-medium text-gray-800 border-s border-gray-200 ${
                              i % 2 === 1 ? "bg-gray-100" : "bg-gray-50"
                            }`}
                          >
                            {c.totalUnits}
                          </td>
                          <td
                            className={`text-center px-4 py-3 font-medium text-gray-900 ${
                              i % 2 === 1 ? "bg-gray-100" : "bg-gray-50"
                            }`}
                          >
                            {c.totalPrice}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white">
                        <td className="sticky start-0 z-10 bg-gray-900 px-4 py-4 font-semibold whitespace-nowrap">
                          الإجمالي ({rows.length} عميل)
                        </td>
                        {columns.map((col, i) => (
                          <td
                            key={col.key}
                            className={`text-center px-4 py-4 font-semibold ${
                              i === 0 ? "border-e border-gray-700" : ""
                            }`}
                          >
                            {columnTotals[col.key]}
                          </td>
                        ))}
                        <td className="text-center px-4 py-4 font-bold border-s border-gray-700">
                          {report.grandTotalUnits}
                        </td>
                        <td className="text-center px-4 py-4 font-bold">
                          {report.grandTotalPrice}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-6 pt-4 border-t border-gray-100">
                تم إنشاء هذا التقرير بواسطة نظام مسار — {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
