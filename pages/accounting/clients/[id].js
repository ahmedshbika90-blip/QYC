import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../../lib/useAuth";
import Nav from "../../../components/Nav";
import Icon from "../../../components/Icon";
import { PageLoading, SkeletonRows } from "../../../components/Loading";
import { useApi, Money, ErrorLine, money, ROUTE_LABEL } from "../../../components/accounting/parts";

// كشف حساب العميل — every invoice (debit) and every amount received
// (credit), oldest first, with the running balance; ageing on top.
// Print / PDF, or download for Excel.
const AGES = [
  ["0-30", "حتى 30 يومًا"],
  ["31-60", "31–60 يومًا"],
  ["61-90", "61–90 يومًا"],
  ["90+", "أكثر من 90 يومًا"],
];
const ymd = (at) => (at ? String(at).slice(0, 10) : "");

function csv(rows, name) {
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

export default function Statement() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const { id } = useRouter().query;
  const { data, error, reload } = useApi(token, id ? `/api/accounting/clients/${encodeURIComponent(id)}` : null);
  if (loading) return <PageLoading />;
  const c = data?.client;
  const s = data?.summary;

  function download() {
    const rows = [["التاريخ", "البيان", "رقم الفاتورة", "مدين", "دائن", "الرصيد"]];
    data.lines.forEach((l) => rows.push([l.date || ymd(l.at), l.kind === "invoice" ? (l.cancelled ? "فاتورة ملغاة" : "فاتورة") : l.kind === "return" ? "رد مبلغ" : "دفعة", l.number || "", l.debit || "", l.credit || "", l.balance]));
    csv(rows, `كشف-حساب-${c.id}.csv`);
  }

  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <div className="print:hidden"><Nav role={role} logout={logout} /></div>
      <main className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-4 pb-10 flex flex-col gap-5">
        <Link href="/accounting/clients" className="self-start h-11 px-2 rounded-xl text-ink font-semibold flex items-center gap-1.5 hover:bg-surface-2 print:hidden">
          <Icon name="chevronRight" size={20} className="rtl-flip" />
          العملاء
        </Link>
        <ErrorLine error={error} onRetry={reload} />
        {!data ? (
          !error && <SkeletonRows count={6} />
        ) : (
          <>
            <section className="bg-white rounded-3xl shadow p-4 sm:p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink-soft">كشف حساب</p>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink break-words">{c.name || `عميل ${c.id}`}</h1>
                  <p className="text-ink-soft break-words">
                    {[`رقم ${c.id}`, c.storeName, ROUTE_LABEL[c.route], c.deliveryRoute, c.location].filter(Boolean).join(" · ")}
                  </p>
                  {c.phone && <a href={`tel:${c.phone}`} className="num text-accent-ink font-semibold" dir="ltr">{c.phone}</a>}
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button type="button" onClick={() => window.print()} className="h-11 px-4 rounded-xl border-2 border-line bg-white text-ink font-semibold flex items-center gap-2">
                    <Icon name="file" size={18} /> طباعة / PDF
                  </button>
                  <button type="button" onClick={download} className="h-11 px-4 rounded-xl bg-accent text-on-accent font-semibold flex items-center gap-2">
                    <Icon name="chart" size={18} /> تنزيل Excel
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-surface-2 p-3"><p className="text-ink-soft">إجمالي الفواتير</p><p className="text-xl font-bold"><Money value={data.invoiced} /></p></div>
                <div className="rounded-2xl bg-green-50 p-3"><p className="text-green-800">المدفوع</p><p className="text-xl font-bold"><Money value={data.paid} /></p></div>
                <div className="rounded-2xl bg-red-50 p-3"><p className="text-red-800">الرصيد المستحق</p><p className="text-xl font-bold text-red-700"><Money value={s.balance} /></p></div>
              </div>
              {s.credit > 0 && <p className="rounded-xl bg-blue-50 text-blue-900 font-semibold px-3 py-2.5">مدفوع زيادة على فواتير ملغاة أو مخفّضة: <Money value={s.credit} /></p>}
              {s.balance > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {AGES.map(([k, label]) => (
                    <div key={k} className={`rounded-2xl border-2 p-3 ${s.ageing[k] > 0 && k !== "0-30" ? "border-red-300" : "border-line"}`}>
                      <p className="text-ink-soft">{label}</p>
                      <p className="font-bold text-ink"><Money value={s.ageing[k]} /></p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="lines-title" className="flex flex-col gap-3">
              <h2 id="lines-title" className="font-display text-xl font-bold text-ink">الحركات</h2>
              {data.lines.length === 0 ? (
                <p className="text-ink-soft bg-white rounded-2xl shadow px-4 py-6 text-center">لا توجد حركات لهذا العميل.</p>
              ) : (
                <>
                  {/* Phones: one card per line */}
                  <ul className="md:hidden bg-white rounded-2xl shadow divide-y divide-line">
                    {data.lines.map((l, i) => (
                      <li key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink break-words">
                            {l.kind === "invoice" ? (l.cancelled ? "فاتورة ملغاة" : "فاتورة") : l.kind === "return" ? "رد مبلغ للعميل" : "دفعة"} {l.number && <span className="num">{l.number}</span>}
                          </p>
                          <p className="text-ink-soft num">{l.date || ymd(l.at)}</p>
                          {l.logId && (
                            <Link href={`/accounting/logs/${encodeURIComponent(l.logId)}`} className="text-sm text-accent-ink font-semibold">سجل <span className="num" dir="ltr">{l.logId.slice(-10)}</span></Link>
                          )}
                        </div>
                        <div className="text-end shrink-0">
                          <p className={`font-bold num ${l.kind === "payment" ? "text-green-700" : "text-ink"}`}>{l.kind === "payment" ? `− ${money(l.credit)}` : money(l.debit)}</p>
                          <p className="text-sm text-ink-soft">الرصيد <span className="num font-semibold text-ink">{money(l.balance)}</span></p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {/* Wider screens and print: a table */}
                  <div className="hidden md:block print:block bg-white rounded-2xl shadow overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-ink-soft border-b border-line">
                          {["التاريخ", "البيان", "مدين", "دائن", "الرصيد"].map((h, i) => (
                            <th key={h} className={`px-4 py-3 font-semibold ${i >= 2 ? "text-end" : "text-start"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {data.lines.map((l, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2.5 num whitespace-nowrap">{l.date || ymd(l.at)}</td>
                            <td className="px-4 py-2.5">
                              {l.kind === "invoice" ? (l.cancelled ? "فاتورة ملغاة" : "فاتورة") : l.kind === "return" ? "رد مبلغ للعميل" : "دفعة"} {l.number && <span className="num">{l.number}</span>}
                              {l.logId && (
                                <Link href={`/accounting/logs/${encodeURIComponent(l.logId)}`} className="text-sm text-accent-ink font-semibold ms-2 print:hidden">سجل <span className="num" dir="ltr">{l.logId.slice(-10)}</span></Link>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-end num">{l.debit ? money(l.debit) : ""}</td>
                            <td className="px-4 py-2.5 text-end num text-green-700">{l.credit ? money(l.credit) : ""}</td>
                            <td className="px-4 py-2.5 text-end num font-bold">{money(l.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
