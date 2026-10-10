import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import DateFields from "../../components/DateFields";
import { PageLoading, SkeletonRows } from "../../components/Loading";
import { useApi, Money, Stat, ErrorLine, MarginValue, LogStatus, Choice, agentName, day, defaultPeriod, money, ROUTE_LABEL } from "../../components/accounting/parts";

// التقارير — one agent or all of them, any period: the logs day by day
// (invoices, total, paid, remaining), the totals, and the payments
// received with their references. Print it, or download it for Excel.
function csvDownload(rows, name) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export default function Reports() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const router = useRouter();
  const [p, setP] = useState(defaultPeriod);
  const [route, setRoute] = useState("all");
  useEffect(() => {
    if (router.query.route) setRoute(String(router.query.route));
  }, [router.query.route]);
  const { data, error, reload } = useApi(token, `/api/accounting/report?from=${p.from}&to=${p.to}&route=${route}`);
  if (loading) return <PageLoading />;
  const t = data?.totals;
  const title = data ? (data.route ? agentName(data.people, data.route) : "كل المناديب") : "";

  function download() {
    const rows = [["التاريخ", "المندوب", "عدد الفواتير", "الإجمالي", "المدفوع", "المتبقي", "بانتظار التوزيع", "هامش التشغيل"]];
    data.logs.forEach((l) => rows.push([l.day, ROUTE_LABEL[l.route] || l.route, l.invoices, l.total, l.paid, l.remaining, l.toDistribute, l.margin ?? ""]));
    rows.push(["الإجمالي", "", t.invoices, t.total, t.paid, t.remaining, t.toDistribute, t.margin ?? ""]);
    rows.push([]);
    rows.push(["الدفعات المستلمة"]);
    rows.push(["تاريخ السجل", "المندوب", "البنك", "رقم العملية", "تاريخ التحويل", "المبلغ", "الموزَّع"]);
    data.payments.forEach((x) => rows.push([x.day, ROUTE_LABEL[x.route] || x.route, x.bankLabel, x.ref, x.date, x.amount, x.allocatedTotal]));
    csvDownload(rows, `تقرير-${route}-${p.from}-${p.to}.csv`);
  }

  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <div className="print:hidden"><Nav role={role} logout={logout} /></div>
      <main className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">التقارير</h1>
            <p className="text-ink-soft mt-1">{title} · {day(p.from)} — {day(p.to)}</p>
          </div>
          {data && (
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="h-11 px-4 rounded-xl border-2 border-line bg-white text-ink font-semibold flex items-center gap-2">
                <Icon name="file" size={18} /> طباعة / PDF
              </button>
              <button type="button" onClick={download} className="h-11 px-4 rounded-xl bg-accent text-on-accent font-semibold flex items-center gap-2">
                <Icon name="chart" size={18} /> تنزيل Excel
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 print:hidden">
          <DateFields from={p.from} to={p.to} onFrom={(from) => setP((x) => ({ ...x, from }))} onTo={(to) => setP((x) => ({ ...x, to }))} />
          <Choice label="المندوب" value={route} onChange={setRoute} options={[["all", "كل المناديب"], ["car1", ROUTE_LABEL.car1], ["car2", ROUTE_LABEL.car2]]} />
        </div>
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="الإجمالي" value={<Money value={t.total} />} sub={`${t.invoices} فاتورة · ${t.logs} سجل`} />
              <Stat label="المدفوع" value={<Money value={t.paid} />} />
              <Stat label="المتبقي" value={<Money value={t.remaining} />} tone={t.remaining > 0 ? "text-red-700" : "text-green-700"} />
              <Stat label="بانتظار التوزيع" value={<Money value={t.toDistribute} />} tone={t.toDistribute > 0 ? "text-amber-700" : "text-ink"} />
              <Stat label="هامش التشغيل" value={<MarginValue t={t} />} tone={t.margin < 0 ? "text-red-700" : "text-green-700"} />
            </div>
            {data.deductions && data.deductions.total > 0 && (
              <section className="rounded-2xl bg-red-50 border border-red-200 p-4 flex flex-col gap-1">
                <p className="font-bold text-red-900">خصومات من الهامش (بتاريخ الاعتماد)</p>
                {data.deductions.agentSamples > 0 && <p className="text-red-900">عينات المناديب (بتاريخ الفاتورة): <Money value={data.deductions.agentSamples} /></p>}
                {data.deductions.obsolete > 0 && <p className="text-red-900">تالف غير صالح: <Money value={data.deductions.obsolete} /></p>}
                {data.deductions.freeSamples > 0 && <p className="text-red-900">عينات مجانية على الشركة: <Money value={data.deductions.freeSamples} /></p>}
                {typeof t.margin === "number" && <p className="font-bold text-ink">صافي الهامش بعد الخصومات: <Money value={t.margin + data.deductions.agentSamples - data.deductions.total} /></p>}
                <ul className="text-sm text-red-900 mt-1">
                  {data.deductions.items.map((x) => (
                    <li key={x.id}><span className="num">{x.day}</span> · {x.kind === "writeoff" ? "تالف غير صالح" : "عينات"} · {x.items} · <span className="num">{money(x.amount)}</span></li>
                  ))}
                </ul>
              </section>
            )}
            <section className="bg-white rounded-2xl shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-ink-soft border-b border-line">
                    {["التاريخ", "المندوب", "الفواتير", "الإجمالي", "المدفوع", "المتبقي", "هامش التشغيل", "الحالة"].map((h, i) => (
                      <th key={h} className={`px-3 py-3 font-semibold ${i >= 2 && i <= 6 ? "text-end" : "text-start"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2.5 whitespace-nowrap">{day(l.day)}</td>
                      <td className="px-3 py-2.5">{ROUTE_LABEL[l.route] || l.route}</td>
                      <td className="px-3 py-2.5 text-end num">{l.invoices}</td>
                      <td className="px-3 py-2.5 text-end num">{money(l.total)}</td>
                      <td className="px-3 py-2.5 text-end num">{money(l.paid)}</td>
                      <td className={`px-3 py-2.5 text-end num font-bold ${l.remaining > 0 ? "text-red-700" : ""}`}>{money(l.remaining)}</td>
                      <td className={`px-3 py-2.5 text-end num ${l.margin < 0 ? "text-red-700" : ""}`}>{typeof l.margin === "number" ? money(l.margin) : "—"}</td>
                      <td className="px-3 py-2.5"><LogStatus status={l.status} /></td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-surface-2">
                    <td className="px-3 py-2.5" colSpan={2}>الإجمالي</td>
                    <td className="px-3 py-2.5 text-end num">{t.invoices}</td>
                    <td className="px-3 py-2.5 text-end num">{money(t.total)}</td>
                    <td className="px-3 py-2.5 text-end num">{money(t.paid)}</td>
                    <td className="px-3 py-2.5 text-end num">{money(t.remaining)}</td>
                    <td className="px-3 py-2.5 text-end num">{typeof t.margin === "number" ? money(t.margin) : "—"}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="font-display text-lg font-bold text-ink">الدفعات المستلمة ({data.payments.length})</h2>
              {data.payments.length === 0 ? (
                <p className="text-ink-soft">لا توجد دفعات مسجلة على السجلات في هذه الفترة.</p>
              ) : (
                <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                  {data.payments.map((x) => (
                    <li key={x.id} className="px-4 py-3 flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{x.bankLabel} · <span className="num" dir="ltr">{x.ref}</span></p>
                        <p className="text-sm text-ink-soft">سجل {day(x.day)} · {ROUTE_LABEL[x.route] || x.route} · تحويل {day(x.date)}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="font-bold num">{money(x.amount)}</p>
                        {x.allocatedTotal < x.amount && <p className="text-xs font-semibold text-amber-700">موزَّع <span className="num">{money(x.allocatedTotal)}</span></p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
