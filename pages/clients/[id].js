import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function ClientDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [client, setClient] = useState(null);
  const [form, setForm] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    fetchClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function fetchClient() {
    setFetching(true);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClient(data);
      setForm({
        name: data.name,
        storeName: data.storeName,
        location: data.location,
        route: data.route,
        active: data.active !== false,
        phone: data.phone || "",
        whatsapp: data.whatsapp || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      fetchClient();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || fetching || !form) return <p className="p-8">Loading...</p>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-md mx-auto mt-8 bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-1 text-gray-800">
          Client #{client.id}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Registered {new Date(client.createdAt).toLocaleDateString()}
        </p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {saved && <p className="text-green-600 text-sm mb-4">Saved.</p>}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Client Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Store Name</label>
            <input
              type="text"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Phone (for calls)</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">WhatsApp Number</label>
            <input
              type="tel"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="Leave same as phone if unchanged"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Route</label>
            <select
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              disabled={role !== "supervisor"}
              className="w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="car1">Car 1 (on-demand)</option>
              <option value="car2">Car 2 (fixed weekly route)</option>
            </select>
            {role !== "supervisor" && (
              <p className="text-xs text-gray-400 mt-1">
                Only a supervisor can reassign a client's route.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active (uncheck to block this client from placing new orders)
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gray-900 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
