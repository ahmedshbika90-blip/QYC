import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { multiFactor, TotpMultiFactorGenerator, EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import Icon from "../components/Icon";
import PasswordInput from "../components/PasswordInput";
import { PageLoading, Spinner } from "../components/Loading";
import { MFA_ROLES } from "../lib/mfa";

// Two-step login (التحقق بخطوتين): an authenticator app on the phone
// (Google Authenticator, Microsoft Authenticator…) shows a 6-digit code that
// changes every 30 seconds; it's asked for after the password.
//   1. "تفعيل" → a QR code (and the key, to type in by hand)
//   2. the code from the app → turned on
//   3. sign in again, this time with the code
// Firebase asks for the password again if the last sign-in was a while ago.
const ISSUER = "Mubashir";
const toLatin = (v) => v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");

export default function Security() {
  const { user, role, loading, logout } = useAuth();
  const router = useRouter();
  const required = process.env.NEXT_PUBLIC_REQUIRE_2FA === "1" && MFA_ROLES.includes(role);
  const [enrolled, setEnrolled] = useState([]);
  const [step, setStep] = useState("status"); // status | password | scan | done
  const [secret, setSecret] = useState(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) setEnrolled(multiFactor(user).enrolledFactors);
  }, [user]);

  async function start() {
    setError("");
    setBusy(true);
    try {
      const session = await multiFactor(auth.currentUser).getSession();
      const s = await TotpMultiFactorGenerator.generateSecret(session);
      const url = s.generateQrCodeUrl(auth.currentUser.email || "user", ISSUER);
      const QR = (await import("qrcode")).default; // this page only
      setQr(await QR.toDataURL(url, { margin: 1, width: 240 }));
      setSecret(s);
      setStep("scan");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") setStep("password");
      else if (err.code === "auth/operation-not-allowed" || err.code === "auth/admin-restricted-operation") setError("التحقق بخطوتين غير مفعّل بعد في إعدادات Firebase — تواصل مع مدير النظام.");
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPassword(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password));
      setPassword("");
      setStep("status");
      await start();
    } catch {
      setError("كلمة المرور غير صحيحة");
    } finally {
      setBusy(false);
    }
  }

  async function finish(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
      await multiFactor(auth.currentUser).enroll(assertion, "تطبيق المصادقة");
      setStep("done");
    } catch (err) {
      setError(err.code === "auth/invalid-verification-code" ? "الرمز غير صحيح — أدخل الرمز الظاهر الآن في التطبيق." : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signInAgain() {
    await signOut(auth);
    router.replace("/login");
  }

  if (loading) return <PageLoading />;
  const on = enrolled.length > 0;

  return (
    <div className="min-h-screen bg-canvas">
      {!(required && !on) && <Nav role={role} logout={logout} />}
      <main className="max-w-lg mx-auto p-4 sm:p-8">
        <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-md flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${on ? "bg-green-50 text-green-700" : "bg-accent-soft text-accent-ink"}`}>
              <Icon name="lock" size={24} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">التحقق بخطوتين</h1>
              <p className="text-sm text-muted mt-1">بعد كلمة المرور، يُطلب رمز من تطبيق المصادقة على هاتفك — فلا يكفي معرفة كلمة المرور وحدها لدخول حسابك.</p>
            </div>
          </div>

          {required && !on && step === "status" && (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2.5">هذا الحساب يتطلب التحقق بخطوتين. فعّله للمتابعة.</p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          {step === "status" && (
            on ? (
              <div className="rounded-2xl bg-green-50 text-green-800 px-4 py-3 flex items-center gap-2">
                <Icon name="check" size={20} />
                <span className="font-semibold">مفعّل</span>
                <span className="text-sm">— {enrolled.map((f) => f.displayName || "تطبيق المصادقة").join("، ")}</span>
              </div>
            ) : (
              <>
                <ol className="text-sm text-ink-soft list-decimal ps-5 space-y-1.5">
                  <li>ثبّت تطبيق مصادقة على هاتفك (Google Authenticator أو Microsoft Authenticator).</li>
                  <li>اضغط «تفعيل» وامسح الرمز المربّع بالتطبيق.</li>
                  <li>أدخل الرمز المكوّن من 6 أرقام الذي يظهر في التطبيق.</li>
                </ol>
                <button type="button" onClick={start} disabled={busy} className="w-full h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <Spinner className="w-4 h-4" /> : <Icon name="lock" size={18} />}
                  تفعيل
                </button>
              </>
            )
          )}

          {step === "password" && (
            <form onSubmit={confirmPassword} className="flex flex-col gap-4">
              <p className="text-sm text-ink-soft">للأمان، أدخل كلمة المرور مرة أخرى.</p>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} inputClassName="w-full border border-line rounded-xl px-3.5 h-12 text-base" autoComplete="current-password" required />
              <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Spinner className="w-4 h-4" />}
                متابعة
              </button>
            </form>
          )}

          {step === "scan" && secret && (
            <form onSubmit={finish} className="flex flex-col gap-4 items-stretch">
              <p className="text-sm text-ink-soft">امسح هذا الرمز بتطبيق المصادقة:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="رمز QR للتحقق بخطوتين" width={240} height={240} className="mx-auto rounded-xl border border-line bg-white" />
              <details className="text-sm">
                <summary className="cursor-pointer text-accent-ink font-semibold min-h-[44px] flex items-center">لا يمكنك المسح؟ أدخل المفتاح يدويًا</summary>
                <p className="num select-all break-all bg-surface-2 rounded-lg px-3 py-2 mt-1 text-ink" dir="ltr">{secret.secretKey.replace(/(.{4})/g, "$1 ").trim()}</p>
              </details>
              <label htmlFor="enroll-code" className="text-sm text-ink-soft">الرمز من التطبيق</label>
              <input
                id="enroll-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(toLatin(e.target.value))}
                className="w-full border border-line rounded-xl h-14 text-2xl tracking-[0.5em] text-center tabular-ltr"
                dir="ltr"
                required
              />
              <button type="submit" disabled={busy || code.length !== 6} className="w-full h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Spinner className="w-4 h-4" />}
                تأكيد التفعيل
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-green-50 text-green-800 px-4 py-3 flex items-center gap-2">
                <Icon name="check" size={20} />
                <span className="font-semibold">تم التفعيل.</span>
              </div>
              <p className="text-sm text-ink-soft">سجّل الدخول من جديد — سيُطلب منك الرمز من التطبيق بعد كلمة المرور.</p>
              <button type="button" onClick={signInAgain} className="w-full h-12 rounded-xl bg-accent text-on-accent font-semibold">
                تسجيل الدخول من جديد
              </button>
            </div>
          )}

          {required && !on && step === "status" && (
            <button type="button" onClick={signInAgain} className="h-11 text-sm text-ink-soft">
              تسجيل الخروج
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
