// Executive dashboard — tab 2 (العملاء والمسارات). Loaded only when the tab is opened.
import Link from "next/link";
import Icon from "../Icon";
import { Section } from "../SupervisorDashboard";
import { Split, pctText } from "../ExecCharts";
import { SkeletonRows } from "../Loading";
import { fmt, V } from "../../lib/dashboardView";
import { ROUTE_LABELS_SHORT } from "../../lib/labels";
import { UNIT, Card, useGet, ErrorBox, PeriodPicker, Stat } from "./parts";

/* ── Tab 2: العملاء والمسارات ───────────────────────────────────────────── */

const ROUTE_COLOR = { car1: "w", car2: "r" };

export default function CustomersTab({ token, range, setRange }) {
  const { data: d, error, busy, reload } = useGet(token, `/api/executive/customers?from=${range.from}&to=${range.to}`, ["orders_car1", "orders_car2", "clients"]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!d) return <SkeletonRows count={6} />;
  const reg = d.registered;
  return (
    <div className={`flex flex-col gap-12 ${busy ? "opacity-60" : ""}`}>
      <Section
        id="c1"
        title="العملاء المسجلون"
        hint="كل العملاء المسجلين في النظام حتى الآن — لا يتأثر بالفترة المختارة."
        aside={
          <Link href="/executive/customers" className="h-11 px-4 rounded-xl bg-white border border-line text-sm font-semibold text-ink flex items-center gap-2">
            <Icon name="users" size={18} />
            قاعدة العملاء الكاملة
            <Icon name="chevronLeft" size={16} />
          </Link>
        }
      >
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline gap-2 min-w-0">
            <span className="dn font-display fig font-bold text-ink">{fmt(reg.total)}</span>
            <span className="text-sm text-muted">عميل</span>
          </div>
          <Split a={reg.routes[0]?.total || 0} b={reg.routes[1]?.total || 0} />
          <div className="grid gap-3 sm:grid-cols-2">
            {reg.routes.map((r) => (
              <Stat
                key={r.route}
                label={ROUTE_LABELS_SHORT[r.route] || r.route}
                value={fmt(r.total)}
                color={ROUTE_COLOR[r.route]}
                sub={`${pctText(r.share)} من الإجمالي${r.inactive ? ` · ${fmt(r.inactive)} غير نشط` : ""}`}
              />
            ))}
          </div>
        </Card>
      </Section>

      <PeriodPicker range={range} onChange={(from, to) => setRange({ from, to })} title="فترة الأداء — تنطبق على المسارات وأكبر العملاء أدناه" />

      <Section id="c2" title="المسارات" hint="أداء كل مسار في الفترة المختارة. «الوصول» = نسبة العملاء النشطين الذين اشتروا في الفترة.">
        <div className="grid gap-5 md:grid-cols-2">
          {d.routes.map((r) => (
            <Card key={r.route} className="p-6 flex flex-col gap-4">
              <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ color: V(ROUTE_COLOR[r.route]) }}>
                <Icon name="truck" size={18} />
                {ROUTE_LABELS_SHORT[r.route] || r.route}
                <span className="text-xs font-normal text-muted" dir="ltr">{r.route}</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="الفواتير" value={fmt(r.invoices)} />
                <Stat label="الوحدات" value={fmt(r.units)} unit={UNIT} />
                <Stat label="عملاء اشتروا" value={fmt(r.buyers)} />
                <Stat label="الوصول" value={pctText(r.reach)} />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="c3" title="أكبر عشرة عملاء" hint="مرتبون حسب الوحدات المشتراة في الفترة المختارة، مع نصيب كل عميل من إجمالي الوحدات المباعة.">
        {d.top.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">لا توجد مبيعات في هذه الفترة</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-muted border-b border-line">
                  <th className="px-4 py-3 text-start font-semibold w-10">#</th>
                  <th className="px-4 py-3 text-start font-semibold">العميل</th>
                  <th className="px-4 py-3 text-start font-semibold">نوع البيع</th>
                  <th className="px-4 py-3 text-end font-semibold">الفواتير</th>
                  <th className="px-4 py-3 text-end font-semibold">الوحدات</th>
                  <th className="px-4 py-3 text-start font-semibold w-[28%]">من إجمالي الوحدات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.top.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 dn font-bold text-muted">{t.rank}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{t.name || `عميل ${t.id}`} <span className="text-xs text-muted dn">#{t.id}</span></td>
                    <td className="px-4 py-3" style={{ color: V(ROUTE_COLOR[t.route]) }}>{ROUTE_LABELS_SHORT[t.route] || t.route}</td>
                    <td className="px-4 py-3 text-end dn">{fmt(t.invoices)}</td>
                    <td className="px-4 py-3 text-end dn font-bold">{fmt(t.units)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden flex">
                          <span className="h-full rounded-full" style={{ width: `${Math.min(100, (t.share / (d.top[0].share || 1)) * 100)}%`, background: V(ROUTE_COLOR[t.route]) }} />
                        </span>
                        <span className="dn text-xs font-bold w-12 text-end">{pctText(t.share)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}

