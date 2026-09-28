import { useState } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { markActivity } from "../lib/session";
import { Spinner } from "../components/Loading";

// Staff login. Clients don't use the app directly — agents place
// invoices on their behalf.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const idleLogout = router.query.reason === "idle";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      markActivity(); // starts this device's idle session
      const tokenResult = await cred.user.getIdTokenResult();
      const role = tokenResult.claims.role;

      if (role === "agent_car1") router.push("/dashboard/car1");
      else if (role === "agent_car2") router.push("/dashboard/car2");
      else if (role === "supervisor") router.push("/dashboard/supervisor");
      else if (role === "warehouse_keeper") router.push("/dashboard/warehouse");
      else setError("لا توجد صلاحية مرتبطة بهذا الحساب. يرجى التواصل مع الإدارة.");
    } catch (err) {
      // Only say "wrong password" when that's actually the reason — on a
      // weak connection, blaming the password sends people chasing the
      // wrong problem.
      if (err.code === "auth/network-request-failed" || !navigator.onLine) {
        setError("تعذر الاتصال بالإنترنت — تحقق من الاتصال ثم حاول مرة أخرى.");
      } else if (err.code === "auth/too-many-requests") {
        setError("محاولات كثيرة — انتظر قليلًا ثم حاول مرة أخرى.");
      } else {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      }
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

        {idleLogout && !error && (
          <p className="text-amber-700 text-sm bg-amber-50 rounded-lg px-3 py-2 mb-4">
            تم تسجيل خروجك تلقائيًا بسبب عدم النشاط لفترة طويلة، لحماية حسابك.
          </p>
        )}

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
