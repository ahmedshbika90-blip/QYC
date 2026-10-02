import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDate, formatDateTime, STORE_CLASSES } from "../../lib/labels";
import { invalidateClients } from "../../lib/clientsStore";
import { useRequestId } from "../../lib/useRequestId";
import { isClientEditLocked, clientEditDeadline, CLIENT_EDIT_WINDOW_HOURS } from "../../lib/clientEditLock";
import SuccessScreen from "../../components/SuccessScreen";
import Icon from "../../components/Icon";

export default function ClientDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [client, setClient] = useState(null);
  const [form, setForm] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // "saved" | "requested"
  const [reason, setReason] = useState("");
  const requestIds = useRequestId();

  useEffect(() => {
    if (!token || !id) return;
    fetchClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function fetchClient() {
    setFetching(true);
    try {
      const res = await apiFetch(`/api/clients/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClient(data);
      setForm({
        name: data.name,
        storeName: data.storeName,
        location: data.location,
        route: data.route,
        storeClass: data.storeClass || "",
        active: data.active !== false,
        phone: data.phone || "",
        whatsapp: data.whatsapp || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  // After 12 hours an agent's save becomes a request to the supervisor
  // (lib/clientEditLock.js). The supervisor always saves directly.
  const locked = role !== "supervisor" && client && isClientEditLocked(client);
  const pending = Boolean(client?.pendingRequest);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // Clients registered before store classes existed have none yet —
      // omit it rather than sending "" (which the server rejects).
      const fields = { ...form, storeClass: form.storeClass || undefined };
      let res;
      if (locked) {
        const { route, ...rest } = fields; // route changes are supervisor-only
        const payload = { ...rest, reason };
        res = await apiFetch(`/api/clients/${id}/edit-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...payload, requestId: requestIds.idFor(payload) }),
        });
      } else {
        res = await apiFetch(`/api/clients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(fields),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "CLIENT_LOCKED") fetchClient(); // the window closed while editing
        throw new Error(data.error);
      }
      if (locked) requestIds.reset();
      setReason("");
      setDone(locked ? "requested" : "saved");
      invalidateClients();
      fetchClient();
    } catch (err) {
      if (locked && !err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || fetching || !form) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-md mx-auto mt-4 sm:mt-8 bg-white p-5 sm:p-8 rounded-lg shadow-md">
        <BackButton />
        <h1 className="text-xl font-semibold mb-1 text-gray-800">
          العميل رقم <span className="tabular-ltr">{client.id}</span>
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          تاريخ التسجيل: {formatDate(client.createdAt)}
        </p>

        {done ? (
          <SuccessScreen
            tone={done === "requested" ? "warn" : "success"}
            title={done === "requested" ? "أُرسل طلب التعديل للمشرف" : "تم حفظ بيانات العميل"}
            number={client.id}
            hint={
              done === "requested"
                ? "لن تتغير بيانات العميل حتى يوافق المشرف. ستصلك رسالة بالقرار."
                : "التعديلات محفوظة وتظهر في كل الشاشات."
            }
            secondary={{ label: "قائمة العملاء", href: "/clients" }}
            primary={{ label: "عرض العميل", onClick: () => setDone(null) }}
          />
        ) : (
        <>
        {error && (
          <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {pending && role !== "supervisor" ? (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl px-3 py-3 text-sm mb-4">
            <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
            <span>يوجد طلب تعديل لهذا العميل بانتظار موافقة المشرف — لا يمكن تعديله حتى يصدر القرار.</span>
          </div>
        ) : locked ? (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl px-3 py-3 text-sm mb-4">
            <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
            <span>
              مرّ أكثر من {CLIENT_EDIT_WINDOW_HOURS} ساعة على تسجيل هذا العميل — أي تعديل يُرسل للمشرف للموافقة أولًا.
            </span>
          </div>
        ) : (
          role !== "supervisor" &&
          clientEditDeadline(client) && (
            <p className="text-xs text-muted mb-4">
              يمكنك التعديل مباشرة حتى {formatDateTime(clientEditDeadline(client).toISOString())}، بعدها يحتاج التعديل موافقة المشرف.
            </p>
          )
        )}

        <form onSubmit={handleSave} className="space-y-4">
        <fieldset disabled={pending && role !== "supervisor"} className="space-y-4 disabled:opacity-60">
          <div>
            <label className="block text-sm text-gray-600 mb-1">اسم العميل</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded-lg px-3 h-12 text-base"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">اسم المتجر</label>
            <input
              type="text"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="w-full border rounded-lg px-3 h-12 text-base"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">الموقع</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full border rounded-lg px-3 h-12 text-base"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">رقم الهاتف (للاتصال) — 10 أرقام تبدأ بصفر</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              pattern="0\d{9}"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              className="w-full border rounded-lg px-3 h-12 text-base tabular-ltr text-start"
              dir="ltr"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">رقم الواتساب</label>
            <input
              type="tel"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              className="w-full border rounded-lg px-3 h-12 text-base tabular-ltr text-start"
              dir="ltr"
              placeholder="اتركه كما هو إذا كان نفس رقم الهاتف"
            />
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
            <label className="block text-sm text-gray-600 mb-1">المسار</label>
            <select
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              disabled={role !== "supervisor"}
              className="w-full border rounded-lg px-3 h-12 text-base disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="car1">مبيعات جملة (حسب الطلب)</option>
              <option value="car2">مبيعات تجزئة (خط أسبوعي ثابت)</option>
            </select>
            {role !== "supervisor" && (
              <p className="text-xs text-gray-400 mt-1">
                المشرف فقط يمكنه تغيير مسار العميل.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-base text-gray-600 min-h-[44px]">
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            نشط (ألغِ التحديد لمنع هذا العميل من تقديم طلبات جديدة)
          </label>

          {locked && (
            <div>
              <label className="block text-sm text-gray-600 mb-1" htmlFor="edit-reason">
                سبب التعديل (يظهر للمشرف)
              </label>
              <textarea
                id="edit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                required
                className="w-full border rounded-lg px-3 py-2 text-base"
                placeholder="مثال: العميل غيّر رقم هاتفه"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Spinner className="w-4 h-4" />}
            {saving ? "جارٍ الإرسال..." : locked ? "إرسال طلب التعديل للمشرف" : "حفظ التغييرات"}
          </button>
        </fieldset>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
