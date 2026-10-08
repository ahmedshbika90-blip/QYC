import { useEffect, useState } from "react";
import Icon from "./Icon";
import DeliveryRoutePicker from "./DeliveryRoutePicker";
import SearchCombobox from "./SearchCombobox";
import { Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { usePlaceOptions } from "../lib/usePlaceOptions";

// "إضافة مسار أو موقع" on the clients screen: add a delivery route, a
// location, or a location on a route — without registering a client. They
// then appear in the pickers on every client and competitor form.
export default function AddPlaceDialog({ token, user, role, onClose, onAdded }) {
  const isManager = role === "manager";
  const [salesRoute, setSalesRoute] = useState(role === "agent_car2" ? "car2" : "car1");
  const places = usePlaceOptions(token, user, salesRoute);
  const [route, setRoute] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!route.trim() && !location.trim()) return setError("اكتب اسم المسار أو الموقع");
    setBusy(true);
    try {
      const res = await apiFetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ route, location, ...(isManager ? { salesRoute } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر الحفظ");
      await places.reload();
      if (!d.added.length) {
        setError(location.trim() ? "هذا الموقع مضاف من قبل" : "هذا المسار مضاف من قبل");
        return;
      }
      onAdded(d.added.map((p) => p.name).join(" — "));
      // Ready for the next one; keep the route (often several locations on one route).
      setLocation("");
      setPickerKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-place-title" className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 flex flex-col gap-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-place-title" className="font-display text-xl font-bold text-ink">إضافة مسار أو موقع</h2>
            <p className="text-sm text-muted mt-0.5">يظهر بعدها في القوائم عند تسجيل العملاء وإدخال أسعار المنافسين.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface-2 shrink-0">
            <Icon name="x" size={20} />
          </button>
        </div>

        {isManager && (
          <div>
            <p className="block text-sm text-gray-600 mb-1">نوع البيع</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع البيع">
              {[["car1", "جملة"], ["car2", "تجزئة"]].map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={salesRoute === v} onClick={() => { setSalesRoute(v); setRoute(""); setPickerKey((k) => k + 1); }} className={`h-12 rounded-lg border text-base ${salesRoute === v ? "border-accent bg-accent-soft text-accent-ink font-bold" : "border-line text-ink-soft"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        <DeliveryRoutePicker key={`${pickerKey}-${salesRoute}`} id="add-place-route" value={route} onChange={setRoute} options={places.routes} required={false} />

        <SearchCombobox
          label="الموقع (اختياري)"
          value={location}
          onChange={setLocation}
          options={places.locations}
          preferred={places.locationsOn(route)}
          placeholder="ابحث أو اكتب موقعًا جديدًا"
          newHint={(name) => `سيُضاف موقعًا جديدًا: ${name}`}
        />

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <Icon name="alert" size={18} />
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-lg border border-line font-semibold text-ink-soft">
            إغلاق
          </button>
          <button type="submit" disabled={busy} className="h-12 rounded-lg bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Spinner className="w-4 h-4" /> : <Icon name="plus" size={18} />}
            إضافة
          </button>
        </div>
      </form>
    </div>
  );
}
