import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";

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
    try {
      const res = await fetch("/api/products/list?all=1", {
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
      const res = await fetch("/api/products/create", {
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
      const res = await fetch(`/api/products/${productId}/update`, {
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
      const res = await fetch(`/api/products/${product.id}/update`, {
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
    if (!confirm(`Delete "${product.name}" permanently? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/products/${product.id}/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="p-8">Loading...</p>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-xl font-semibold mb-1 text-gray-800">Product Catalog</h1>
        {!isSupervisor && (
          <p className="text-sm text-gray-400 mb-6">
            Read-only — only a supervisor can add or edit products.
          </p>
        )}

        {error && <p className="text-red-600 text-sm mb-4 mt-4">{error}</p>}

        {isSupervisor && (
          <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 mb-6 mt-4 grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Product name"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="border rounded px-3 py-2"
              required
            />
            <input
              type="text"
              placeholder="Category (optional)"
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Price"
              value={addForm.price}
              onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
              className="border rounded px-3 py-2"
              required
            />
            <input
              type="text"
              placeholder="Unit (e.g. carton, piece, kg)"
              value={addForm.unit}
              onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
              className="border rounded px-3 py-2"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="col-span-2 bg-gray-900 text-white rounded py-2 font-medium disabled:opacity-50"
            >
              {submitting ? "Adding..." : "+ Add Product"}
            </button>
          </form>
        )}

        {fetching ? (
          <p className="text-gray-400">Loading products...</p>
        ) : products.length === 0 ? (
          <p className="text-gray-400">No products yet.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {products.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="p-4 grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="border rounded px-3 py-2"
                    placeholder="Name"
                  />
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="border rounded px-3 py-2"
                    placeholder="Category"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="border rounded px-3 py-2"
                    placeholder="Price"
                  />
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="border rounded px-3 py-2"
                    placeholder="Unit"
                  />
                  <div className="col-span-2 flex gap-2">
                    <button
                      onClick={() => saveEdit(p.id)}
                      disabled={saving}
                      className="bg-gray-900 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-sm text-gray-500 px-4 py-1.5"
                    >
                      Cancel
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
                        className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className={`text-xs px-3 py-1 rounded ${
                          p.active ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                        }`}
                      >
                        {p.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => deleteProduct(p)}
                        className="text-xs px-3 py-1 rounded bg-red-100 text-red-700"
                      >
                        Delete
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
