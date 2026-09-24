import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";

export default function PlaceOrder() {
  const { role, token, loading, logout } = useAuth();

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Client picker
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientBoxRef = useRef(null);

  // Product picker + cart
  const [productQuery, setProductQuery] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [cart, setCart] = useState([]); // [{ productId, name, price, unit, qty }]
  const productBoxRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Close dropdowns when clicking outside them.
  useEffect(() => {
    function handleClickOutside(e) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target)) {
        setClientDropdownOpen(false);
      }
      if (productBoxRef.current && !productBoxRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchData() {
    setFetching(true);
    try {
      const [clientsRes, productsRes] = await Promise.all([
        fetch("/api/clients/list", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/products/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const clientsData = await clientsRes.json();
      const productsData = await productsRes.json();
      if (!clientsRes.ok) throw new Error(clientsData.error);
      if (!productsRes.ok) throw new Error(productsData.error);
      setClients(clientsData.clients.filter((c) => c.active !== false));
      setProducts(productsData.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  const filteredClients = clients
    .filter((c) => {
      if (!clientQuery) return true;
      const needle = clientQuery.toLowerCase();
      return (
        c.id.includes(needle) ||
        c.name.toLowerCase().includes(needle) ||
        c.storeName.toLowerCase().includes(needle)
      );
    })
    .slice(0, 8);

  function pickClient(c) {
    setSelectedClient(c);
    setClientQuery("");
    setClientDropdownOpen(false);
  }

  function clearClient() {
    setSelectedClient(null);
    setClientQuery("");
  }

  const cartProductIds = new Set(cart.map((it) => it.productId));
  const filteredProducts = products
    .filter((p) => !cartProductIds.has(p.id))
    .filter((p) => {
      if (!productQuery) return true;
      return p.name.toLowerCase().includes(productQuery.toLowerCase());
    })
    .slice(0, 8);

  function addProduct(p) {
    setCart((prev) => [...prev, { productId: p.id, name: p.name, price: p.price, unit: p.unit, qty: 1 }]);
    setProductQuery("");
    setProductDropdownOpen(false);
  }

  function setCartQty(productId, qty) {
    setCart((prev) =>
      prev.map((it) => (it.productId === productId ? { ...it, qty: Math.max(1, qty) } : it))
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((it) => it.productId !== productId));
  }

  const total = cart.reduce((sum, it) => sum + it.price * it.qty, 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!selectedClient) {
      setError("Select a client first");
      return;
    }
    if (cart.length === 0) {
      setError("Add at least one product");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders/create-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: selectedClient.id,
          items: cart.map((it) => ({ productId: it.productId, qty: it.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place order");
      setResult(data);
      setCart([]);
      clearClient();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="p-8">Loading...</p>;

  if (role === "supervisor") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-gray-500">
          Supervisors oversee orders but don't place them directly — use the agent
          accounts for phone-in orders.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-lg mx-auto p-8">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-xl font-semibold mb-6 text-gray-800">Place an Order for a Client</h1>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
              <p className="text-green-800 font-medium">Order placed! ID: {result.orderId}</p>
              <p className="text-green-700 text-sm mt-1">Total: {result.total}</p>
              {result.deliveryDate ? (
                <p className="text-green-700 text-sm mt-1">
                  Delivery date: {new Date(result.deliveryDate).toDateString()}
                </p>
              ) : (
                <p className="text-green-700 text-sm mt-1">On-demand — arrange timing directly.</p>
              )}
            </div>
          )}

          {fetching ? (
            <p className="text-gray-400 text-sm">Loading clients and catalog...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Client picker */}
              <div ref={clientBoxRef} className="relative">
                <label className="block text-sm text-gray-600 mb-1">Client</label>

                {selectedClient ? (
                  <div className="flex items-center justify-between border rounded px-3 py-2 bg-gray-50">
                    <span className="text-sm text-gray-800">
                      #{selectedClient.id} — {selectedClient.name} ({selectedClient.storeName})
                    </span>
                    <button
                      type="button"
                      onClick={clearClient}
                      className="text-xs text-gray-400 hover:text-gray-700"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={clientQuery}
                      onChange={(e) => {
                        setClientQuery(e.target.value);
                        setClientDropdownOpen(true);
                      }}
                      onFocus={() => setClientDropdownOpen(true)}
                      placeholder="Search by name, store, or ID..."
                      className="w-full border rounded px-3 py-2"
                    />
                    {clientDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-56 overflow-y-auto">
                        {filteredClients.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-gray-400">No clients match</p>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => pickClient(c)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
                            >
                              #{c.id} — {c.name} <span className="text-gray-400">({c.storeName})</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Product picker */}
              <div ref={productBoxRef} className="relative">
                <label className="block text-sm text-gray-600 mb-1">Add Products</label>
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setProductDropdownOpen(true);
                  }}
                  onFocus={() => setProductDropdownOpen(true)}
                  placeholder="Search products..."
                  className="w-full border rounded px-3 py-2"
                />
                {productDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-56 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">No matching products</p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => addProduct(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0 flex justify-between"
                        >
                          <span>{p.name}</span>
                          <span className="text-gray-400">
                            {p.price} / {p.unit}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Cart */}
              {cart.length > 0 && (
                <div className="border rounded divide-y">
                  {cart.map((it) => (
                    <div key={it.productId} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="text-sm text-gray-800">{it.name}</p>
                        <p className="text-xs text-gray-400">
                          {it.price} / {it.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={it.qty}
                          onChange={(e) => setCartQty(it.productId, Number(e.target.value))}
                          className="w-16 border rounded px-2 py-1 text-sm text-right"
                        />
                        <button
                          type="button"
                          onClick={() => removeFromCart(it.productId)}
                          className="text-red-400 hover:text-red-600 text-sm px-1"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
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
          )}
        </div>
      </div>
    </div>
  );
}
