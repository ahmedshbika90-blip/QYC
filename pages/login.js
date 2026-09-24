import { useState } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { Spinner } from "../components/Loading";

// Staff/agent login. Clients never log in — they place orders with
// their 4-digit ID via /new-order instead.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const tokenResult = await cred.user.getIdTokenResult();
      const role = tokenResult.claims.role;

      if (role === "agent_car1") router.push("/dashboard/car1");
      else if (role === "agent_car2") router.push("/dashboard/car2");
      else if (role === "supervisor") router.push("/dashboard/supervisor");
      else setError("لا توجد صلاحية مرتبطة بهذا الحساب. يرجى التواصل مع الإدارة.");
    } catch (err) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 sm:p-8 rounded-lg shadow-md w-full max-w-sm mx-4"
      >
        <h1 className="text-xl font-semibold mb-6 text-gray-800">تسجيل دخول الموظفين</h1>

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        <label className="block text-sm text-gray-600 mb-1">البريد الإلكتروني</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 h-12 text-base mb-4 tabular-ltr text-start"
          dir="ltr"
          required
        />

        <label className="block text-sm text-gray-600 mb-1">كلمة المرور</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-lg px-3 h-12 text-base mb-6"
          dir="ltr"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Spinner className="w-4 h-4" />}
          {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}
