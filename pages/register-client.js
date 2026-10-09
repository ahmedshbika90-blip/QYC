import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import Icon from "../components/Icon";
import BackButton from "../components/BackButton";
import SuccessScreen from "../components/SuccessScreen";
import { PageLoading, Spinner } from "../components/Loading";
import { normalizePhone } from "../lib/validation";
import { apiFetch } from "../lib/apiFetch";
import { invalidateClients } from "../lib/clientsStore";
import { useRequestId } from "../lib/useRequestId";
import { STORE_CLASSES } from "../lib/labels";
import DeliveryRoutePicker from "../components/DeliveryRoutePicker";
import SearchCombobox from "../components/SearchCombobox";
import { usePlaceOptions } from "../lib/usePlaceOptions";
import { useVans, vanTypeOf } from "../lib/useVans";
import { ROUTE_LABELS } from "../lib/labels";
import { getAuthFlags } from "../lib/authFlags";

export default function RegisterClient() {
  const { user, role, token, loading, logout } = useAuth();
  const [form, setForm] = useState({
    nameFirst: "",
    nameMiddle: "",
    nameLast: "",
    storeName: "",
    deliveryRoute: "",
    location: "",
    route: "car1",
    storeClass: "",
    phone: "",
    whatsapp: "",
  });
  const [sameAsPhone, setSameAsPhone] = useState(true);
  // Routes already used on this sales type (wholesale / retail).
  const vans = useVans(token);
  // Routes/locations lists are per sales TYPE (car1 = wholesale, car2 = retail).
  const myVan = getAuthFlags().route;
  const salesRoute = role === "agent_car1" ? "car1" : role === "agent_car2" ? "car2" : vanTypeOf(vans, form.route) === "retail" ? "car2" : "car1";
  // Routes and locations already in use on this sales type (clients + ones
  // added on their own). Reloaded after each save, so a route or location
  // added on this client shows for the next one without a page refresh.
  const places = usePlaceOptions(token, user, salesRoute);
  const known = places.clients;
  const routeOptions = places.routes;
  const [pickerKey, setPickerKey] = useState(0); // remounts the picker after a save
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requestIds = useRequestId();

  if (loading) return <PageLoading />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    // Basic data required before a client is created at all — explained
    // clearly rather than a silent/blocked submit, mirroring the same
    // check the server itself enforces.
    if (!form.nameFirst.trim() || !form.nameMiddle.trim() || !form.nameLast.trim()) {
      setError("اسم العميل مطلوب ثلاثيًا: الاسم الأول والأوسط والأخير");
      return;
    }
    if (!form.deliveryRoute.trim()) {
      setError("المسار مطلوب — اختره من القائمة أو أضف مسارًا جديدًا");
      return;
    }
    if (!form.storeName.trim() || !form.location.trim() || !form.phone.trim()) {
      setError("اسم المتجر والموقع ورقم الهاتف كلها مطلوبة");
      return;
    }
    if (!form.storeClass) {
      setError("اختر تصنيف المتجر (A أو B أو C)");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        whatsapp: sameAsPhone ? form.phone : form.whatsapp,
      };
      payload.requestId = requestIds.idFor(payload);
      const res = await apiFetch("/api/clients/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تسجيل العميل");
      setResult(data);
      requestIds.reset();
      invalidateClients();
      places.reload(); // the new route/location is in the lists for the next client
      setForm({
        nameFirst: "",
        nameMiddle: "",
        nameLast: "",
        storeName: "",
        deliveryRoute: "",
        location: "",
        route: "car1",
        storeClass: "",
        phone: "",
        whatsapp: "",
      });
      setSameAsPhone(true);
      setPickerKey((k) => k + 1);
      // No new tab: the success card replaces the form right here, and
      // "تسجيل عميل آخر" brings back an empty form.
    } catch (err) {
      // Connection failure: keep the same request ID so "retry" is safe.
      // Server rejection: a fresh ID next time.
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-md mx-auto px-4 pt-4 pb-8 sm:px-0">
        {!result && <BackButton href="/clients" label="العملاء" />}
        <h1 className="font-display text-2xl font-bold mb-4 mt-1 text-ink">تسجيل عميل جديد</h1>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
            <Icon name="alert" size={18} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success replaces the form entirely — the client's number is the
            whole point of this moment, so it's the only thing on screen. */}
        {result ? (
          <SuccessScreen
            title="تم تسجيل العميل"
            number={result.clientId}
            hint="أعطِ هذا الرقم للعميل — سيستخدمه لتقديم الطلبات."
            secondary={{ label: "قائمة العملاء", href: "/clients" }}
            primary={{ label: "تسجيل عميل آخر", onClick: () => setResult(null) }}
          />
        ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">اسم العميل (ثلاثي)</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                enterKeyHint="next"
                value={form.nameFirst}
                onChange={(e) => setForm({ ...form, nameFirst: e.target.value })}
                className="w-full border rounded-lg px-3 h-12 text-base"
                placeholder="الأول"
                required
              />
              <input
                type="text"
                enterKeyHint="next"
                value={form.nameMiddle}
                onChange={(e) => setForm({ ...form, nameMiddle: e.target.value })}
                className="w-full border rounded-lg px-3 h-12 text-base"
                placeholder="الأوسط"
                required
              />
              <input
                type="text"
                enterKeyHint="next"
                value={form.nameLast}
                onChange={(e) => setForm({ ...form, nameLast: e.target.value })}
                className="w-full border rounded-lg px-3 h-12 text-base"
                placeholder="الأخير"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">اسم المتجر</label>
            <input
              type="text"
                enterKeyHint="next"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="w-full border rounded-lg px-3 h-12 text-base"
              required
            />
          </div>

          <DeliveryRoutePicker
            key={`${pickerKey}-${salesRoute}`}
            value={form.deliveryRoute}
            onChange={(v) => setForm((f) => ({ ...f, deliveryRoute: v }))}
            options={routeOptions}
          />

          <SearchCombobox
            label="الموقع"
            value={form.location}
            onChange={(v) => setForm((f) => ({ ...f, location: v }))}
            options={places.locations}
            preferred={places.locationsOn(form.deliveryRoute)}
            placeholder="ابحث أو اكتب موقعًا جديدًا"
            newHint={(name) => `سيُضاف موقعًا جديدًا: ${name}`}
            required
          />

          <div>
            <label className="block text-sm text-gray-600 mb-1">رقم الهاتف (للاتصال) — 10 أرقام تبدأ بصفر</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              pattern="0\d{9}"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: normalizePhone(e.target.value) })}
              className="w-full border rounded-lg px-3 h-12 text-base tabular-ltr text-start"
              dir="ltr"
              placeholder="0912345678"
              required
            />
            {form.phone.length === 10 && known.find((c) => c.phone === form.phone) && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-1.5">
                هذا الرقم مسجّل للعميل «{known.find((c) => c.phone === form.phone).name}» — تأكد أنه ليس نفس العميل.
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-base text-gray-600 min-h-[44px]">
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={sameAsPhone}
                onChange={(e) => setSameAsPhone(e.target.checked)}
              />
              رقم الواتساب هو نفس رقم الهاتف
            </label>
            {!sameAsPhone && (
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="0\d{9}"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: normalizePhone(e.target.value) })}
                className="w-full border rounded-lg px-3 h-12 text-base tabular-ltr text-start"
                dir="ltr"
                placeholder="رقم الواتساب إن كان مختلفًا"
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">تصنيف المتجر</label>
            <div className="grid grid-cols-3 gap-2">
              {STORE_CLASSES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, storeClass: c })}
                  className={`h-12 rounded-lg text-base font-medium border ${
                    form.storeClass === c
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 active:bg-gray-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">نوع البيع</label>
            {role === "manager" ? (
              <select
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value, deliveryRoute: "" })}
                className="w-full border rounded-lg px-3 h-12 text-base"
              >
                {vans.filter((v) => v.active !== false).map((v) => (
                  <option key={v.id} value={v.id}>{v.id === "car1" || v.id === "car2" ? ROUTE_LABELS[v.id] : `${v.label} — ${v.type === "retail" ? "تجزئة" : "جملة"}`}</option>
                ))}
              </select>
            ) : (
              <p className="w-full border rounded-lg px-3 h-12 text-base bg-gray-50 text-gray-600 flex items-center">
                {ROUTE_LABELS[myVan] || (role === "agent_car1" ? "مبيعات جملة (حسب الطلب)" : "مبيعات تجزئة (خط أسبوعي ثابت)")}
              </p>
            )}
            {role !== "manager" && (
              <p className="text-xs text-gray-400 mt-1">
                يتم تحديد نوع البيع تلقائيًا حسب حسابك — العملاء الجدد يُسجَّلون عليه فقط.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            {submitting ? "جارٍ التسجيل..." : "تسجيل العميل"}
          </button>
        </form>
        )}
      </main>
    </div>
  );
}
