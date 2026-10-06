import { getAuthFlags } from "../lib/authFlags";
import { ROUTES } from "../lib/roles";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { useRequestId } from "../lib/useRequestId";
import { formatNumber, formatQty } from "../lib/labels";
import NumericInput from "../components/NumericInput";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "../lib/constants";

const emptyForm = { name: "", nameEn: "", category: "", unit: "", priceCar1: "", priceCar2: "", depotStock: "", avgCost: "" };

const fieldClass = "border rounded-lg px-3 h-12 text-base w-full bg-white";

// Money box: decimals allowed. Text field (not type="number") so the
// decimal point works on every phone keyboard; Arabic digits and "٫" are
// converted to English as they are typed.
function MoneyInput({ value, onChange, placeholder, required, className = "" }) {
  return (
    <NumericInput
      decimal
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className={`${fieldClass} text-end placeholder:text-right ${className}`}
    />
  );
}

// Quantity box: whole numbers only — no decimal point can be typed.
function WholeInput({ value, onChange, placeholder, className = "" }) {
  return (
    <NumericInput value={value} onChange={onChange} placeholder={placeholder} className={`${fieldClass} text-end placeholder:text-right ${className}`} />
  );
}

// Fixed list. `current` is a product's old free-text value (from before
// the lists existed): shown as a hint, but an edit must pick from the list.
function ListSelect({ value, onChange, options, placeholder, current, className = "" }) {
  const legacy = current && !options.includes(current) ? current : null;
  return (
    <div className={className}>
      <select value={value} onChange={(e) => onChange(e.target.value)} required className={fieldClass}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {legacy && (
        <p className="text-xs text-amber-600 mt-1">القيمة الحالية «{legacy}» غير موجودة في القائمة — اختر من القائمة.</p>
      )}
    </div>
  );
}

export default function Products() {
  const { role, token, loading, logout } = useAuth();
  const isSupervisor = role === "manager";

  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const requestIds = useRequestId();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchProducts() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch("/api/products/list?all=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProducts(data.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/products/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...addForm,
          openingStock: addForm.depotStock,
          requestId: requestIds.idFor(addForm),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      setAddForm(emptyForm);
      fetchProducts();
    } catch (err) {
      // Connection failure: keep the same request ID so "retry" is safe.
      // Server rejection: a fresh ID next time.
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(product) {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      nameEn: product.nameEn || "",
      // Old free-text values aren't in the lists: start empty so the
      // supervisor has to choose (the old value is shown as a hint).
      category: PRODUCT_CATEGORIES.includes(product.category) ? product.category : "",
      unit: PRODUCT_UNITS.includes(product.unit) ? product.unit : "",
      priceCar1: String(product.prices?.car1 ?? ""),
      priceCar2: String(product.prices?.car2 ?? ""),
      depotStock: String(product.stock?.depot ?? 0),
      avgCost: product.avgCost != null ? String(product.avgCost) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function saveEdit(productId) {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/products/${productId}/update`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingId(null);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product) {
    try {
      const res = await apiFetch(`/api/products/${product.id}/update`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !product.active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="font-display text-2xl font-bold mb-1 text-ink">{isSupervisor ? "كتالوج المنتجات" : "المخزون"}</h1>
        {!isSupervisor && (
          <p className="text-sm text-gray-400 mb-6">
            للعرض فقط — المدير وحده يمكنه إضافة أو تعديل المنتجات وأسعارها.
          </p>
        )}

        {!isSupervisor && <StockSections products={products} role={role} />}
        {!isSupervisor && <h2 className="font-display text-lg font-bold text-ink mb-3">كتالوج المنتجات</h2>}

        {error && (
          <div className="text-red-600 text-sm mb-4 mt-4 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={fetchProducts} className="underline shrink-0">إعادة المحاولة</button>
          </div>
        )}

        {isSupervisor && (
          <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 mb-6 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="اسم المنتج"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className={fieldClass}
              required
            />
            <input
              type="text"
              dir="ltr"
              placeholder="Product name in English (optional)"
              value={addForm.nameEn}
              onChange={(e) => setAddForm({ ...addForm, nameEn: e.target.value })}
              className={`${fieldClass} text-start`}
              maxLength={80}
              data-no-translate
            />
            <ListSelect
              value={addForm.category}
              onChange={(v) => setAddForm({ ...addForm, category: v })}
              options={PRODUCT_CATEGORIES}
              placeholder="نوع المنتج"
            />
            <ListSelect
              value={addForm.unit}
              onChange={(v) => setAddForm({ ...addForm, unit: v })}
              options={PRODUCT_UNITS}
              placeholder="الوحدة"
            />
            <MoneyInput
              placeholder="سعر الجملة"
              value={addForm.priceCar1}
              onChange={(v) => setAddForm({ ...addForm, priceCar1: v })}
              required
            />
            <MoneyInput
              placeholder="سعر التجزئة"
              value={addForm.priceCar2}
              onChange={(v) => setAddForm({ ...addForm, priceCar2: v })}
              required
            />
            <MoneyInput
              placeholder="تكلفة الوحدة من المورد"
              value={addForm.avgCost}
              onChange={(v) => setAddForm({ ...addForm, avgCost: v })}
              required
            />
            <WholeInput
              placeholder="الرصيد الافتتاحي بالمخزن (اختياري)"
              value={addForm.depotStock}
              onChange={(v) => setAddForm({ ...addForm, depotStock: v })}
            />
            <button
              type="submit"
              disabled={submitting}
              className="sm:col-span-2 bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              {submitting ? "جارٍ الإضافة..." : "+ إضافة منتج"}
            </button>
          </form>
        )}

        {fetching ? (
          <SkeletonRows count={4} />
        ) : products.length === 0 ? (
          <p className="text-gray-400">لا توجد منتجات بعد.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {products.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className={fieldClass}
                    placeholder="الاسم"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={editForm.nameEn}
                    onChange={(e) => setEditForm({ ...editForm, nameEn: e.target.value })}
                    className={`${fieldClass} text-start`}
                    placeholder="Product name in English (optional)"
                    maxLength={80}
                    data-no-translate
                  />
                  <ListSelect
                    value={editForm.category}
                    onChange={(v) => setEditForm({ ...editForm, category: v })}
                    options={PRODUCT_CATEGORIES}
                    placeholder="نوع المنتج"
                    current={p.category}
                  />
                  <ListSelect
                    value={editForm.unit}
                    onChange={(v) => setEditForm({ ...editForm, unit: v })}
                    options={PRODUCT_UNITS}
                    placeholder="الوحدة"
                    current={p.unit}
                  />
                  <MoneyInput
                    value={editForm.priceCar1}
                    onChange={(v) => setEditForm({ ...editForm, priceCar1: v })}
                    placeholder="سعر الجملة"
                  />
                  <MoneyInput
                    value={editForm.priceCar2}
                    onChange={(v) => setEditForm({ ...editForm, priceCar2: v })}
                    placeholder="سعر التجزئة"
                  />
                  <WholeInput
                    value={editForm.depotStock}
                    onChange={(v) => setEditForm({ ...editForm, depotStock: v })}
                    placeholder="رصيد المخزن"
                    className="sm:col-span-2"
                  />
                  <div className="sm:col-span-2">
                    <MoneyInput
                      value={editForm.avgCost}
                      onChange={(v) => setEditForm({ ...editForm, avgCost: v })}
                      placeholder="تكلفة الوحدة من المورد (لهامش التشغيل)"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      تُحدَّث تلقائيًا بآخر سعر مورد عند اعتماد كل استلام، وتُطبَّق على كل المخزون. الفواتير السابقة تبقى على تكلفتها.
                    </p>
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button
                      onClick={() => saveEdit(p.id)}
                      disabled={saving}
                      className="bg-accent text-on-accent rounded-lg px-4 min-h-[44px] text-base active:bg-accent-strong disabled:opacity-50"
                    >
                      {saving ? "جارٍ الحفظ..." : "حفظ"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-base text-gray-500 px-4 min-h-[44px]"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className={`font-medium ${p.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                      {p.name}
                      {isSupervisor && p.nameEn && <span className="ms-2 text-xs text-muted font-normal" dir="ltr" data-no-translate>{p.nameEn}</span>}
                    </p>
                    <p className="text-sm text-gray-500">
                      {p.category ? `${p.category} — ` : ""}
                      لكل {p.unit}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      مبيعات جملة: <span className="font-medium">{p.prices?.car1 != null ? formatNumber(p.prices.car1) : "—"}</span>
                      {"  ·  "}
                      مبيعات تجزئة: <span className="font-medium">{p.prices?.car2 != null ? formatNumber(p.prices.car2) : "—"}</span>
                    </p>
                    {isSupervisor && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      المخزن: {formatQty(p.stock?.depot ?? 0)} · مبيعات جملة: {formatQty(p.stock?.car1 ?? 0)} · مبيعات تجزئة: {formatQty(p.stock?.car2 ?? 0)}
                    </p>
                    )}
                    {isSupervisor && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        تكلفة الوحدة: {typeof p.avgCost === "number" ? p.avgCost : <span className="text-amber-600">غير محددة</span>}
                      </p>
                    )}
                  </div>
                  {isSupervisor && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-sm px-3 min-h-[44px] rounded-lg bg-gray-100 text-gray-600 active:bg-gray-200"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className={`text-sm px-3 min-h-[44px] rounded-lg ${
                          p.active ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                        }`}
                      >
                        {p.active ? "إلغاء التفعيل" : "تفعيل"}
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Agent view: stock by location, then the catalog (prices only).
// The wholesale agent sees his van, the retail van and the main depot.
// The retail agent sees his van and the main depot — the server never
// sends him the wholesale van's stock (pages/api/products/list.js).
function StockSections({ products, role }) {
  // Own van first; a sales supervisor also sees the other vans.
  const mine = role === "agent_car1" ? "car1" : "car2";
  const others = getAuthFlags().salesSupervisor ? ROUTES.filter((r) => r !== mine) : [];
  const places = [[mine, "سيارتي"], ...others.map((r) => [r, r === "car1" ? "سيارة الجملة" : "سيارة التجزئة"]), ["depot", "المخزن الرئيسي"]];
  return (
    <div className="space-y-3 mb-6">
      {places.map(([field, label]) => {
        const rows = products.filter((p) => (p.stock?.[field] ?? 0) > 0);
        return (
          <section key={field} className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-base font-bold text-ink mb-1">{label}</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-muted py-1">لا توجد بضاعة</p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-ink">{p.name}</span>
                    <span className="num font-semibold tabular-ltr shrink-0">
                      {formatQty(p.stock[field])} <span className="text-muted font-normal">{p.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
