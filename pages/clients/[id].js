import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDate } from "../../lib/labels";

export default function ClientDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [client, setClient] = useState(null);
  const [form, setForm] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await apiFetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      fetchClient();
    } catch (err) {
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
        <h1 className="text-xl font-semibold mb-1 text-gray-800">
          العميل رقم <span className="tabular-ltr">{client.id}</span>
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          تاريخ التسجيل: {formatDate(client.createdAt)}
        </p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {saved && <p className="text-green-600 text-sm mb-4">تم الحفظ.</p>}

        <form onSubmit={handleSave} className="space-y-4">
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
            <label className="block text-sm text-gray-600 mb-1">المسار</label>
            <select
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              disabled={role !== "supervisor"}
              className="w-full border rounded-lg px-3 h-12 text-base disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="car1">السيارة ١ (حسب الطلب)</option>
              <option value="car2">السيارة ٢ (خط أسبوعي ثابت)</option>
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

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Spinner className="w-4 h-4" />}
            {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </button>
        </form>
      </div>
    </div>
  );
}
