import { useEffect, useState } from "react";

// No login required — clients identify themselves with their 4-digit ID.
export default function NewOrder() {
  const [clientId, setClientId] = useState("");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [quantities, setQuantities] = useState({}); // productId -> qty
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/products/list")
      .then((res) => res.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => setError("Could not load the product catalog"))
      .finally(() => setLoadingProducts(false));
  }, []);

  function setQty(productId, qty) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  const selectedItems = products
    .filter((p) => quantities[p.id] > 0)
    .map((p) => ({ productId: p.id, name: p.name, price: p.price, unit: p.unit, qty: quantities[p.id] }));

  const total = selectedItems.reduce((sum, it) => sum + it.price * it.qty, 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (selectedItems.length === 0) {
      setError("Add at least one product with a quantity greater than 0");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          items: selectedItems.map((it) => ({ productId: it.productId, qty: it.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place order");
      setResult(data);
      setQuantities({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-6 text-gray-800">Place an Order</h1>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
            <p className="text-green-800 font-medium">Order placed! ID: {result.orderId}</p>
            <p className="text-green-700 text-sm mt-1">Total: {result.total}</p>
            {result.deliveryDate ? (
              <p className="text-green-700 text-sm mt-1">
                Expected delivery: {new Date(result.deliveryDate).toDateString()}
              </p>
            ) : (
              <p className="text-green-700 text-sm mt-1">
                Your agent will contact you shortly to arrange delivery.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Your Client ID</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border rounded px-3 py-2 font-mono"
              placeholder="1000"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">Products</label>
            {loadingProducts ? (
              <p className="text-gray-400 text-sm">Loading catalog...</p>
            ) : products.length === 0 ? (
              <p className="text-gray-400 text-sm">No products available yet.</p>
            ) : (
              <div className="border rounded divide-y">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        {p.price} / {p.unit}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={quantities[p.id] || ""}
                      onChange={(e) => setQty(p.id, Number(e.target.value))}
                      placeholder="0"
                      className="w-20 border rounded px-2 py-1 text-sm text-right"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="text-right text-sm text-gray-600">
              Total: <span className="font-semibold text-gray-900">{total.toFixed(2)}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? "Placing order..." : "Place Order"}
          </button>
        </form>
      </div>
    </div>
  );
}
