import { useMemo, useRef, useState } from "react";
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
  const [sharing, setSharing] = useState(false);
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
    setSharing(true);
    setError("");

    // The on-screen table scrolls horizontally when there are many product
    // columns — capturing it as-is only grabs whatever portion happens to
    // be visible, cropping the rest. Widening just the inner scroll area
    // isn't enough on its own: the outer report container doesn't expand
    // just because a descendant inside it got wider (overflow:visible
    // children don't grow their ancestor's own box), so html2canvas can
    // still size its capture off the outer box's original narrow width.
    // Fix: widen BOTH the inner scroll area and the outer container to an
    // explicit measured pixel width (not "max-content" — that conflicts
    // with the table's own w-full class and silently fails), and also
    // pass that width straight to html2canvas as a third safety net.
    const outer = reportRef.current;
    const scrollAreas = outer.querySelectorAll(".overflow-x-auto");
    const originalStyles = [{ el: outer, overflow: outer.style.overflow, width: outer.style.width }];

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      let fullWidth = outer.scrollWidth;
      scrollAreas.forEach((el) => {
        originalStyles.push({ el, overflow: el.style.overflow, width: el.style.width });
        fullWidth = Math.max(fullWidth, el.scrollWidth);
      });

      scrollAreas.forEach((el) => {
        el.style.overflow = "visible";
        el.style.width = `${fullWidth}px`;
      });
      outer.style.overflow = "visible";
      outer.style.width = `${fullWidth}px`;

      const canvas = await html2canvas(outer, {
        scale: 2,
        backgroundColor: "#ffffff",
        width: fullWidth,
        windowWidth: fullWidth,
      });
      const imgData = canvas.toDataURL("image/png");

      // The page is sized to the content plus a margin on every side —
      // without this, the PDF page exactly matches the image and the
      // report ends up looking like a tightly-cropped screenshot rather
      // than a page, with the table touching the edges.
      const margin = 80; // px, at the same 2x scale as the capture
      const pageWidth = canvas.width + margin * 2;
      const pageHeight = canvas.height + margin * 2;

      const pdf = new jsPDF({
        orientation: pageWidth > pageHeight ? "l" : "p",
        unit: "px",
        format: [pageWidth, pageHeight],
      });
      pdf.addImage(imgData, "PNG", margin, margin, canvas.width, canvas.height);
      const blob = pdf.output("blob");
      const file = new File([blob], "تقرير-المبيعات.pdf", { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "تقرير المبيعات" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "تقرير-المبيعات.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        // AbortError just means the person closed the share sheet without
        // picking anything — not a real failure, nothing to show for it.
        setError("تعذر إنشاء ملف التقرير للمشاركة. حاول مرة أخرى.");
      }
    } finally {
      originalStyles.forEach(({ el, overflow, width }) => {
        el.style.overflow = overflow;
        el.style.width = width;
      });
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
            اترك التواريخ فارغة لعرض كل السجل. الفواتير الملغاة لا تُحتسب ضمن التقرير.
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
              <div className="mb-4">
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

              {rows.length === 0 ? (
                <p className="text-gray-400">لا توجد مبيعات في هذه الفترة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-800">
                        <th className="sticky start-0 bg-white text-start font-semibold text-gray-700 px-3 py-2 whitespace-nowrap">
                          العميل
                        </th>
                        {columns.map((col) => (
                          <th
                            key={col.key}
                            className="text-center font-semibold text-gray-700 px-3 py-2 whitespace-nowrap"
                          >
                            {col.name}
                            {col.unit && <span className="block text-xs font-normal text-gray-400">({col.unit})</span>}
                          </th>
                        ))}
                        <th className="text-center font-semibold text-gray-700 px-3 py-2 whitespace-nowrap bg-gray-50">
                          إجمالي الوحدات
                        </th>
                        <th className="text-center font-semibold text-gray-700 px-3 py-2 whitespace-nowrap bg-gray-50">
                          إجمالي السعر
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ client: c, cells }, i) => (
                        <tr key={c.clientId} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                          <td className="sticky start-0 bg-inherit px-3 py-2">
                            <p className="text-gray-800 font-medium whitespace-nowrap">{c.name}</p>
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              <span className="tabular-ltr">#{c.clientId}</span> · {c.location}
                            </p>
                          </td>
                          {columns.map((col) => (
                            <td key={col.key} className="text-center px-3 py-2 text-gray-700">
                              {cells[col.key] ?? <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td className="text-center px-3 py-2 font-medium text-gray-800 bg-gray-50/70">
                            {c.totalUnits}
                          </td>
                          <td className="text-center px-3 py-2 font-medium text-gray-900 bg-gray-50/70">
                            {c.totalPrice}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-800 font-semibold">
                        <td className="sticky start-0 bg-white px-3 py-2 text-gray-800 whitespace-nowrap">
                          الإجمالي ({rows.length} عميل)
                        </td>
                        {columns.map((col) => (
                          <td key={col.key} className="text-center px-3 py-2 text-gray-800">
                            {columnTotals[col.key]}
                          </td>
                        ))}
                        <td className="text-center px-3 py-2 text-gray-900 bg-gray-100">
                          {report.grandTotalUnits}
                        </td>
                        <td className="text-center px-3 py-2 text-gray-900 bg-gray-100">
                          {report.grandTotalPrice}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
