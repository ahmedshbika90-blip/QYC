import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import { PageLoading, SkeletonRows, Spinner } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";

const emptyForm = { name: "", price: "", unit: "", category: "" };

export default function Products() {
  const { role, token, loading, logout } = useAuth();
  const isSupervisor = role === "supervisor";

  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
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
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddForm(emptyForm);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(product) {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      price: product.price,
      unit: product.unit,
      category: product.category || "",
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

  async function deleteProduct(product) {
    if (!confirm(`حذف "${product.name}" نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      const res = await apiFetch(`/api/products/${product.id}/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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
        <h1 className="text-xl font-semibold mb-1 text-gray-800">كتالوج المنتجات</h1>
        {!isSupervisor && (
          <p className="text-sm text-gray-400 mb-6">
            للعرض فقط — المشرف وحده يمكنه إضافة أو تعديل المنتجات.
          </p>
        )}

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
              type="number"
              step="0.01"
              min="0"
              placeholder="السعر"
              value={addForm.price}
              onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base"
              required
            />
            <input
              type="text"
              placeholder="الوحدة (مثال: كرتون، قطعة، كيلو)"
              value={addForm.unit}
              onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
              className="border rounded-lg px-3 h-12 text-base"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="col-span-2 bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
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
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base"
                    placeholder="السعر"
                  />
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="border rounded-lg px-3 h-12 text-base"
                    placeholder="الوحدة"
                  />
                  <div className="col-span-2 flex gap-2">
                    <button
                      onClick={() => saveEdit(p.id)}
                      disabled={saving}
                      className="bg-gray-900 text-white rounded-lg px-4 min-h-[44px] text-base active:bg-gray-700 disabled:opacity-50"
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
                      {p.price} / {p.unit}
                    </p>
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
                      <button
                        onClick={() => deleteProduct(p)}
                        className="text-sm px-3 min-h-[44px] rounded-lg bg-red-100 text-red-700 active:bg-red-200"
                      >
                        حذف
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
