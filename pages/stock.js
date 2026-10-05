import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import StockBoard from "../components/StockBoard";
import { PageLoading, SkeletonRows } from "../components/Loading";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";

// All stock, every location, read-only — the accountant's stock view.
export default function AllStock() {
  const { role, token, loading, logout } = useAuth(["accountant"]);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const d = await cachedGet(apiFetch, "/api/products/list?all=1", token);
      setProducts(d.products.filter((p) => p.active !== false));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useLiveRefresh(token, ["inventory", "orders_car1", "orders_car2"], load);

  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-5xl mx-auto px-4 pt-5 pb-8 sm:px-8 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">المخزون</h1>
          <p className="text-sm text-muted mt-1">رصيد لحظي في المخزن الرئيسي وكل السيارات — للعرض فقط.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {products ? <StockBoard products={products} /> : !error && <SkeletonRows count={6} />}
      </main>
    </div>
  );
}
