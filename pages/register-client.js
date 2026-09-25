import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import { PageLoading, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";

export default function RegisterClient() {
  const { role, token, loading, logout } = useAuth();
  const [form, setForm] = useState({
    name: "",
    storeName: "",
    location: "",
    route: "car1",
    phone: "",
    whatsapp: "",
  });
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <PageLoading />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        whatsapp: sameAsPhone ? form.phone : form.whatsapp,
      };
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
      setForm({ name: "", storeName: "", location: "", route: "car1", phone: "", whatsapp: "" });
      setSameAsPhone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-md mx-auto mt-4 sm:mt-8 bg-white p-5 sm:p-8 rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-6 text-gray-800">تسجيل عميل جديد</h1>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800 font-medium">
              تم تسجيل العميل — الرقم:{" "}
              <span className="font-mono text-lg tabular-ltr">{result.clientId}</span>
            </p>
            <p className="text-green-700 text-sm mt-1">
              أعطِ هذا الرقم للعميل، سيستخدمه لتقديم الطلبات.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="مثال: العمارات، شارع ١٥"
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
              placeholder="0912345678"
              required
            />
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
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                className="w-full border rounded-lg px-3 h-12 text-base tabular-ltr text-start"
                dir="ltr"
                placeholder="رقم الواتساب إن كان مختلفًا"
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">المسار</label>
            {role === "supervisor" ? (
              <select
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
                className="w-full border rounded-lg px-3 h-12 text-base"
              >
                <option value="car1">السيارة ١ (حسب الطلب)</option>
                <option value="car2">السيارة ٢ (خط أسبوعي ثابت)</option>
              </select>
            ) : (
              <p className="w-full border rounded-lg px-3 h-12 text-base bg-gray-50 text-gray-600 flex items-center">
                {role === "agent_car1" ? "السيارة ١ (حسب الطلب)" : "السيارة ٢ (خط أسبوعي ثابت)"}
              </p>
            )}
            {role !== "supervisor" && (
              <p className="text-xs text-gray-400 mt-1">
                يتم تحديد المسار تلقائيًا حسب حسابك — العملاء الجدد يُسجَّلون على مسارك فقط.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            {submitting ? "جارٍ التسجيل..." : "تسجيل العميل"}
          </button>
        </form>
      </div>
    </div>
  );
}
