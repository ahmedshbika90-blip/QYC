import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { useRequestId } from "../lib/useRequestId";
import { formatNumber, formatQty } from "../lib/labels";

const emptyForm = { name: "", category: "", unit: "", priceCar1: "", priceCar2: "", depotStock: "", avgCost: "" };

export default function Products() {
  const { role, token, loading, logout } = useAuth();
  const isSupervisor = role === "supervisor";

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
      category: product.category || "",
      unit: product.unit,
      priceCar1: product.prices?.car1 ?? "",
      priceCar2: product.prices?.car2 ?? "",
      depotStock: product.stock?.depot ?? 0,
      avgCost: product.avgCost ?? "",
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
            للعرض فقط — المشرف وحده يمكنه إضافة أو تعديل المنتجات وأسعارها.
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
              className="border rounded-lg px-3 h-12 text-base"
              required
            />
            <input
              type="text"
              placeholder="الفئة (اختياري)"
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base"
            />
            <input
              type="text"
              placeholder="الوحدة (مثال: كرتون، قطعة، كيلو)"
              value={addForm.unit}
              onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base sm:col-span-2"
              required
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="سعر الجملة"
              value={addForm.priceCar1}
              onChange={(e) => setAddForm({ ...addForm, priceCar1: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base"
              required
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="سعر التجزئة"
              value={addForm.priceCar2}
              onChange={(e) => setAddForm({ ...addForm, priceCar2: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base"
              required
            />
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              min="0"
              placeholder="الرصيد الافتتاحي بالمخزن (اختياري)"
              value={addForm.depotStock}
              onChange={(e) => setAddForm({ ...addForm, depotStock: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base sm:col-span-2"
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
                    className="border rounded-lg px-3 h-12 text-base"
                    placeholder="الاسم"
                  />
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base"
                    placeholder="الفئة"
                  />
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base sm:col-span-2"
                    placeholder="الوحدة"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.priceCar1}
                    onChange={(e) => setEditForm({ ...editForm, priceCar1: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base"
                    placeholder="سعر الجملة"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.priceCar2}
                    onChange={(e) => setEditForm({ ...editForm, priceCar2: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base"
                    placeholder="سعر التجزئة"
                  />
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    min="0"
                    value={editForm.depotStock}
                    onChange={(e) => setEditForm({ ...editForm, depotStock: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base sm:col-span-2"
                    placeholder="رصيد المخزن"
                  />
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.avgCost}
                      onChange={(e) => setEditForm({ ...editForm, avgCost: e.target.value })}
                      className="border rounded-lg px-3 h-12 text-base w-full"
                      placeholder="تكلفة الوحدة من المورد (لهامش التشغيل)"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      تُحدَّث تلقائيًا بمتوسط أسعار المورد عند اعتماد كل استلام. عدّلها هنا فقط لتحديد تكلفة المخزون الحالي.
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
  const places =
    role === "agent_car1"
      ? [["car1", "سيارتي"], ["car2", "سيارة التجزئة"], ["depot", "المخزن الرئيسي"]]
      : [["car2", "سيارتي"], ["depot", "المخزن الرئيسي"]];
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
