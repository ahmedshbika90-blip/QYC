import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import { PageLoading } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { formatDateTime } from "../../lib/labels";

const TYPE_LABELS = {
  received: "استلام بضاعة",
  loading: "تحميل",
  offloading: "تفريغ",
};

export default function InventoryDocDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [doc, setDoc] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    fetchDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function fetchDoc() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch(`/api/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDoc(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  if (loading || fetching) return <PageLoading />;

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav role={role} logout={logout} />
        <p className="p-8 text-red-600 text-sm">{error || "المستند غير موجود"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow p-5 sm:p-6">
          <div className="flex justify-between items-start gap-2 mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">
                {TYPE_LABELS[doc.type] || doc.type}
                {doc.route && (
                  <span className="text-sm font-normal text-gray-400 ms-2">
                    {doc.route === "car1" ? "السيارة ١" : "السيارة ٢"}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-400 mt-1">{formatDateTime(doc.createdAt)}</p>
            </div>
            <span
              className={`text-sm px-3 h-9 flex items-center rounded-lg shrink-0 ${
                doc.status === "confirmed"
                  ? "bg-green-50 text-green-700"
                  : doc.status === "disputed"
                  ? "bg-red-50 text-red-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {doc.status === "confirmed" ? "مؤكدة" : doc.status === "disputed" ? "متنازع عليها" : "قيد التأكيد"}
            </span>
          </div>

          <div className="border rounded-lg divide-y">
            {doc.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
                <p className="text-base text-gray-800">{it.name}</p>
                <div className="text-end">
                  <p className="text-base font-medium text-gray-800">
                    {it.qty} {it.unit || ""}
                  </p>
                  {it.costPrice != null && (
                    <p className="text-xs text-gray-400">تكلفة الوحدة: {it.costPrice}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {doc.notes && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-1">ملاحظات</p>
              <p className="text-base text-gray-700">{doc.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
