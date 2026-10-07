import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import Icon from "../components/Icon";
import NumericInput from "../components/NumericInput";
import SuccessToast from "../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet, invalidate } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { useRequestId } from "../lib/useRequestId";
import { getAuthFlags } from "../lib/authFlags";
import { distinct } from "../lib/competitorView";
import { formatDate, formatNumber } from "../lib/labels";

// Sales supervisor: records a competitor's price seen in the market. The
// entries go straight to the executive's "أسعار المنافسين" page.
// Same layout as the invoice form: one column, big fields, one big button.
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
const field = "w-full border rounded-lg px-3 h-12 text-base";
const API = "/api/competitors";

export default function CompetitorEntry() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  const empty = { company: "", item: "", sku: "", price: "", date: todayYmd() };
  const [form, setForm] = useState(empty);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const rid = useRequestId();
  const itemRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
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

  // Earlier entries feed the suggestions, so a company or product isn't
  // spelled three different ways.
  const companies = useMemo(() => distinct(entries || [], "company"), [entries]);
  const skus = useMemo(() => distinct(entries || [], "sku"), [entries]);
  const items = useMemo(() => distinct(entries || [], "item"), [entries]);
  const mine = useMemo(() => (entries || []).filter((e) => e.mine).slice(0, 20), [entries]);

  // Picking a SKU already entered fills in its product name.
  function onSku(v) {
    const known = (entries || []).find((e) => e.sku === v);
    setForm((f) => ({ ...f, sku: v, item: f.item || (known ? known.item : "") }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.company.trim()) return setError("اسم الشركة مطلوب");
    if (!form.item.trim()) return setError("اسم الصنف مطلوب");
    if (!form.sku.trim()) return setError("رمز الصنف (SKU) مطلوب");
    if (!(Number(form.price) > 0)) return setError("أدخل السعر");
    if (!form.date) return setError("التاريخ غير صالح");
    setBusy(true);
    try {
      const res = await apiFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, requestId: rid.idFor(form) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر حفظ السعر");
      rid.reset();
      invalidate(API);
      setEntries((list) => [d.entry, ...(list || []).filter((x) => x.id !== d.entry.id)]);
      // Usually several products from the same company on the same visit:
      // keep company and date, clear the rest.
      setForm((f) => ({ ...empty, company: f.company, date: f.date }));
      setToast("تم حفظ سعر المنافس");
      itemRef.current?.focus();
    } catch (err) {
      if (!err.isNetworkError) rid.reset();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    if (!confirm(`حذف سعر ${entry.item} — ${entry.company}؟`)) return;
    try {
      const res = await apiFetch(`${API}/${encodeURIComponent(entry.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      invalidate(API);
      setEntries((list) => list.filter((x) => x.id !== entry.id));
      setToast("تم حذف الإدخال");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <PageLoading />;
  if (!getAuthFlags().salesSupervisor) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-gray-500">إدخال أسعار المنافسين لمشرف المبيعات فقط.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <div className="max-w-lg mx-auto p-4 sm:p-8 flex flex-col gap-5">
        <div className="bg-white p-5 sm:p-8 rounded-lg shadow-md">
          <BackButton />
          <h1 className="font-display text-2xl font-bold mb-1 text-ink">أسعار المنافسين</h1>
          <p className="text-sm text-muted mb-6">ما تدخله هنا يظهر مباشرة للإدارة التنفيذية.</p>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
              <Icon name="alert" size={18} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="cp-company" className="block text-sm text-gray-600 mb-1">الشركة المنافسة</label>
              <input id="cp-company" list="cp-companies" value={form.company} onChange={(e) => set("company", e.target.value)} maxLength={60} autoComplete="off" enterKeyHint="next" placeholder="اسم الشركة" className={field} required />
              <datalist id="cp-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
            </div>

            <div>
              <label htmlFor="cp-sku" className="block text-sm text-gray-600 mb-1">رمز الصنف (SKU)</label>
              <input id="cp-sku" list="cp-skus" value={form.sku} onChange={(e) => onSku(e.target.value)} maxLength={40} autoComplete="off" enterKeyHint="next" dir="ltr" placeholder="SKU" className={`${field} text-start`} required />
              <datalist id="cp-skus">{skus.map((c) => <option key={c} value={c} />)}</datalist>
            </div>

            <div>
              <label htmlFor="cp-item" className="block text-sm text-gray-600 mb-1">اسم الصنف</label>
              <input id="cp-item" ref={itemRef} list="cp-items" value={form.item} onChange={(e) => set("item", e.target.value)} maxLength={80} autoComplete="off" enterKeyHint="next" placeholder="مثال: طحنية سادة 400 جم" className={field} required />
              <datalist id="cp-items">{items.map((c) => <option key={c} value={c} />)}</datalist>
            </div>

            <div>
              <label htmlFor="cp-price" className="block text-sm text-gray-600 mb-1">السعر (SDG)</label>
              <NumericInput id="cp-price" value={form.price} onChange={(v) => set("price", v)} placeholder="0" className={`${field} text-end`} required />
            </div>

            <div>
              <label htmlFor="cp-date" className="block text-sm text-gray-600 mb-1">التاريخ</label>
              <input id="cp-date" type="date" max={todayYmd()} value={form.date} onChange={(e) => set("date", e.target.value)} className={field} required />
            </div>

            <button type="submit" disabled={busy} className="w-full bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Spinner className="w-4 h-4" />}
              {busy ? "جارٍ الحفظ..." : "حفظ السعر"}
            </button>
          </form>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-ink">آخر ما أدخلته</h2>
          {!entries ? (
            <SkeletonRows count={3} />
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted bg-white rounded-2xl shadow px-4 py-5 text-center">لم تُدخل أي سعر بعد.</p>
          ) : (
            <ul className="bg-white rounded-2xl shadow divide-y divide-line">
              {mine.map((e) => (
                <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{e.item}</p>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {e.company} · <span className="num" dir="ltr">{e.sku}</span> · {formatDate(`${e.date}T12:00:00Z`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="num font-bold text-ink">{formatNumber(e.price)}</span>
                    <button type="button" onClick={() => remove(e)} aria-label={`حذف ${e.item}`} className="w-11 h-11 rounded-xl flex items-center justify-center text-red-600 bg-red-50 active:bg-red-100">
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
