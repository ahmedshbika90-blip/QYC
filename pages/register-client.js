import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";

export default function RegisterClient() {
  const { role, token, loading, logout } = useAuth();
  const [form, setForm] = useState({
    name: "",
    storeName: "",
    location: "",
    route: "car1",
    phone: "",
    whatsapp: "",
  });
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <p className="p-8">Loading...</p>;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        whatsapp: sameAsPhone ? form.phone : form.whatsapp,
      };
      const res = await fetch("/api/clients/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setResult(data);
      setForm({ name: "", storeName: "", location: "", route: "car1", phone: "", whatsapp: "" });
      setSameAsPhone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-md mx-auto mt-8 bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-6 text-gray-800">Register New Client</h1>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
            <p className="text-green-800 font-medium">
              Client registered — ID: <span className="font-mono text-lg">{result.clientId}</span>
            </p>
            <p className="text-green-700 text-sm mt-1">
              Give this ID to the client. They'll use it to place orders.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="e.g. Al-Amarat, Street 15"
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
              placeholder="e.g. 091 234 5678"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <input
                type="checkbox"
                checked={sameAsPhone}
                onChange={(e) => setSameAsPhone(e.target.checked)}
              />
              WhatsApp is the same number
            </label>
            {!sameAsPhone && (
              <input
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder="WhatsApp number, if different"
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Route</label>
            <select
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="car1">Car 1 (on-demand)</option>
              <option value="car2">Car 2 (fixed weekly route)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? "Registering..." : "Register Client"}
          </button>
        </form>
      </div>
    </div>
  );
}
