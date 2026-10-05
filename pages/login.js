import { useState } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { markActivity } from "../lib/session";
import { Spinner } from "../components/Loading";
import Icon from "../components/Icon";
import { ROLE_HOME, normalizeRole } from "../lib/roles";
import LangToggle from "../components/LangToggle";

// Staff login. Clients don't use the app directly — agents place
// invoices on their behalf.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const idleLogout = router.query.reason === "idle";
  const revokedLogout = router.query.reason === "revoked";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      markActivity(); // starts this device's idle session
      const tokenResult = await cred.user.getIdTokenResult();
      const role = normalizeRole(tokenResult.claims.role);

      if (ROLE_HOME[role]) router.push(ROLE_HOME[role]);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas px-4 py-10">
      <LangToggle className="fixed top-3 end-3 bg-white shadow" />
      <div className="flex flex-col items-center gap-3 mb-8 text-center">
        <span className="w-16 h-16 rounded-2xl bg-accent text-on-accent flex items-center justify-center shadow-lg">
          <Icon name="route" size={34} strokeWidth={2.2} />
        </span>
        <div>
          <p className="font-display text-3xl font-bold text-ink">مباشر</p>
          <p className="text-sm text-muted mt-1">إدارة المبيعات والتوزيع</p>
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg w-full max-w-sm"
      >
        <h1 className="text-xl font-bold mb-6 text-ink">تسجيل دخول الموظفين</h1>

        {idleLogout && !error && (
          <p className="text-amber-700 text-sm bg-amber-50 rounded-lg px-3 py-2 mb-4">
            تم تسجيل خروجك تلقائيًا بسبب عدم النشاط لفترة طويلة، لحماية حسابك.
          </p>
        )}

        {revokedLogout && !error && (
          <p className="text-amber-700 text-sm bg-amber-50 rounded-lg px-3 py-2 mb-4">
            تم تحديث صلاحيات حسابك أو إيقافه من قبل مدير النظام. سجّل الدخول من جديد.
          </p>
        )}

        {error && (
          <p role="alert" className="text-red-600 bg-red-50 rounded-xl px-3 py-2.5 text-sm mb-4">{error}</p>
        )}

        <label className="block text-sm font-medium text-ink-soft mb-1.5">البريد الإلكتروني</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-line rounded-xl px-3.5 h-12 text-base mb-4 tabular-ltr text-start"
          dir="ltr"
          required
        />

        <label className="block text-sm font-medium text-ink-soft mb-1.5">كلمة المرور</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded-xl px-3.5 h-12 text-base mb-6"
          dir="ltr"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-on-accent rounded-xl h-12 font-semibold text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Spinner className="w-4 h-4" />}
          {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}
