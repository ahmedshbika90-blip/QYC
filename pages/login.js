import { useState } from "react";
import { useRouter } from "next/router";
import { newLoginSession } from "../lib/notificationSeen";
import { signInWithEmailAndPassword, getMultiFactorResolver, TotpMultiFactorGenerator } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { markActivity } from "../lib/session";
import { Spinner } from "../components/Loading";
import { ROLE_HOME, normalizeRole } from "../lib/roles";
import LangToggle from "../components/LangToggle";
import PasswordInput from "../components/PasswordInput";

// Staff login. Clients don't use the app directly — agents place
// invoices on their behalf.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Second step (authenticator code) when the account has it turned on.
  const [mfa, setMfa] = useState(null); // MultiFactorResolver
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const idleLogout = router.query.reason === "idle";
  const revokedLogout = router.query.reason === "revoked";

  async function afterSignIn(cred) {
    markActivity(); // starts this device's idle session
    newLoginSession(); // the sign-in prompt shows again for this new session
    const tokenResult = await cred.user.getIdTokenResult();
    const role = normalizeRole(tokenResult.claims.role);
    if (ROLE_HOME[role]) router.push(ROLE_HOME[role]);
    else setError("لا توجد صلاحية مرتبطة بهذا الحساب. يرجى التواصل مع الإدارة.");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let cred;
      if (mfa) {
        const hint = mfa.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || mfa.hints[0];
        cred = await mfa.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()));
      } else {
        cred = await signInWithEmailAndPassword(auth, email, password);
      }
      await afterSignIn(cred);
    } catch (err) {
      if (err.code === "auth/multi-factor-auth-required") {
        setMfa(getMultiFactorResolver(auth, err));
        setCode("");
        return;
      }
      if (err.code === "auth/invalid-verification-code" || err.code === "auth/missing-code") {
        setError("الرمز غير صحيح أو انتهت صلاحيته — أدخل الرمز الظاهر الآن في تطبيق المصادقة.");
        return;
      }
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
        <div>
          <p className="font-display text-4xl font-bold text-accent-ink">مباشر</p>
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

        {mfa ? (
          <>
            <p className="text-sm text-ink-soft mb-4">
              أدخل الرمز المكوّن من 6 أرقام الظاهر الآن في تطبيق المصادقة على هاتفك.
            </p>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-ink-soft mb-1.5">رمز التحقق</label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, ""))}
              className="w-full border border-line rounded-xl px-3.5 h-14 text-2xl tracking-[0.5em] text-center mb-6 tabular-ltr"
              dir="ltr"
              required
            />
            <button type="submit" disabled={loading || code.length !== 6} className="w-full bg-accent text-on-accent rounded-xl h-12 font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Spinner className="w-4 h-4" />}
              تأكيد
            </button>
            <button type="button" onClick={() => { setMfa(null); setCode(""); setError(""); }} className="w-full mt-2 h-11 text-sm text-ink-soft">
              رجوع
            </button>
          </>
        ) : (
        <>
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
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6"
          inputClassName="w-full border border-line rounded-xl px-3.5 h-12 text-base"
          autoComplete="current-password"
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
        </>
        )}
      </form>
    </div>
  );
}
