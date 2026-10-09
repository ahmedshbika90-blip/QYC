import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import Icon from "../components/Icon";
import SuccessToast from "../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { formatDateTime, formatQty } from "../lib/labels";

import { vanName, vanShort, vanTypeOfId } from "../lib/vanNames";
// فحص المخزون (manager): every night each product's balance is compared
// with its starting point plus every movement since. Differences are shown
// here (and as a notification) — never corrected automatically. After
// counting, "الرصيد صحيح" accepts the current balance as the new start.
const PLACE = new Proxy({ depot: "المخزن", car1: "عربة الجملة", car2: "عربة التجزئة", damaged: "التالف" }, { get: (t, k) => t[k] || vanName(String(k)) });

export default function StockCheck() {
  const { role, token, loading, logout } = useAuth(["manager"]);
  const [check, setCheck] = useState(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const call = useCallback(
    async (body) => {
      const res = await apiFetch("/api/stock-check", {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      return d.check;
    },
    [token]
  );
  const load = useCallback(() => token && call().then(setCheck).catch((e) => setError(e.message)), [token, call]);
  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(token, ["stockCheck"], load);

  async function act(key, body, message) {
    setBusy(key);
    setError("");
    try {
      setCheck(await call(body));
      setToast(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="max-w-3xl mx-auto px-4 sm:px-8 pt-5 pb-10 flex flex-col gap-4">
        <div>
          <BackButton />
          <h1 className="font-display text-2xl font-bold text-ink mt-1">فحص المخزون</h1>
          <p className="text-sm text-ink-soft mt-1">كل ليلة يُقارن رصيد كل منتج بما تقوله حركاته (استلام، تحميل، مرتجعات، تالف، تحويلات، مبيعات، إلغاءات). الفروق تظهر هنا ولا تُصحَّح تلقائيًا.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}
        {check === undefined ? (
          <SkeletonRows count={4} />
        ) : !check ? (
          <div className="bg-white rounded-2xl shadow p-5 text-center flex flex-col gap-3">
            <p className="text-ink">لم يُشغَّل الفحص بعد. أول تشغيل يأخذ الأرصدة الحالية كنقطة بداية.</p>
            <button type="button" onClick={() => act("run", { action: "run" }, "تم تشغيل الفحص")} disabled={!!busy} className="h-12 rounded-xl bg-accent text-on-accent font-semibold">بدء الفحص</button>
          </div>
        ) : (
          <>
            <div className={`rounded-2xl p-4 flex items-center gap-3 ${check.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              <Icon name={check.ok ? "check" : "alert"} size={24} />
              <div className="flex-1">
                <p className="font-bold">{check.ok ? "كل الأرصدة مطابقة لحركاتها" : `${check.diffs.length} فرق في الأرصدة`}</p>
                <p className="text-sm">آخر فحص {formatDateTime(check.at)}{check.baseline ? " — نقطة البداية" : ` · ${check.movements} حركة · ${check.products} منتج`}</p>
              </div>
              <button type="button" onClick={() => act("run", { action: "run" }, "تم تشغيل الفحص")} disabled={!!busy} className="h-11 px-3 rounded-xl bg-white text-ink font-semibold flex items-center gap-2 shrink-0">
                {busy === "run" ? <Spinner className="w-4 h-4" /> : <Icon name="refresh" size={18} />}
                فحص الآن
              </button>
            </div>
            {!check.ok && (
              <ul className="bg-white rounded-2xl shadow divide-y divide-line">
                {check.diffs.map((d) => (
                  <li key={`${d.productId}-${d.field}`} className="px-4 py-3.5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-ink">{d.name}</p>
                        <p className="text-sm text-ink-soft">{PLACE[d.field] || d.field}</p>
                      </div>
                      <p className={`font-display text-xl font-bold num ${d.difference < 0 ? "text-red-700" : "text-amber-700"}`} dir="ltr">
                        {d.difference > 0 ? "+" : ""}
                        {formatQty(d.difference)}
                      </p>
                    </div>
                    <p className="text-sm text-ink-soft">
                      حسب الحركات: <span className="num font-semibold text-ink">{formatQty(d.expected)}</span> · الرصيد الحالي: <span className="num font-semibold text-ink">{formatQty(d.actual)}</span>
                    </p>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => window.confirm(`اعتماد الرصيد الحالي (${formatQty(d.actual)}) لـ ${d.name} — ${PLACE[d.field] || d.field} بعد الجرد؟`) && act(`${d.productId}-${d.field}`, { action: "accept", productId: d.productId, field: d.field }, "تم اعتماد الرصيد")}
                      className="h-11 rounded-xl border-2 border-line font-semibold text-ink self-start px-4 flex items-center gap-2"
                    >
                      {busy === `${d.productId}-${d.field}` && <Spinner className="w-4 h-4" />}
                      الرصيد صحيح بعد الجرد
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
