import { useAuth } from "../lib/useAuth";
import { useA11y } from "../lib/a11y";
import { useTheme } from "../lib/theme";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import Icon from "../components/Icon";
import { PageLoading } from "../components/Loading";

// سهولة القراءة — each person sets how the app looks on THEIR phone:
// bigger text, bolder text, high contrast, underlined links, light/dark.
// Changes apply instantly (and before the first paint on every next visit).
const SIZES = [
  [0, "عادي", "100%"],
  [1, "كبير", "112%"],
  [2, "أكبر", "125%"],
  [3, "كبير جدًا", "140%"],
];

function Toggle({ title, hint, on, onChange, icon }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-full text-start rounded-2xl border-2 p-4 flex items-center gap-3 min-h-[4.5rem] ${on ? "border-accent bg-accent-soft" : "border-line bg-white"}`}
    >
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${on ? "bg-accent text-on-accent" : "bg-surface-2 text-ink"}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-ink text-base">{title}</span>
        <span className="block text-sm text-ink-soft mt-0.5">{hint}</span>
      </span>
      <span aria-hidden="true" className={`w-14 h-8 rounded-full p-1 shrink-0 flex ${on ? "bg-accent justify-end" : "bg-gray-300 justify-start"}`}>
        <span className="block w-6 h-6 rounded-full bg-snow shadow" />
      </span>
    </button>
  );
}

export default function Accessibility() {
  const { role, loading, logout } = useAuth();
  const { prefs, update, reset } = useA11y();
  const { isDark, toggle } = useTheme();
  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-lg mx-auto p-4 sm:p-8 flex flex-col gap-5">
        <div>
          <BackButton />
          <h1 className="font-display text-2xl font-bold text-ink mt-1">سهولة القراءة</h1>
          <p className="text-sm text-ink-soft mt-1">اختر ما يريح عينيك. يُحفظ على هذا الجهاز ويُطبَّق فورًا على كل الصفحات.</p>
        </div>

        <section aria-labelledby="size-title" className="bg-white rounded-3xl shadow p-4 sm:p-5 flex flex-col gap-3">
          <h2 id="size-title" className="font-bold text-ink text-lg">حجم النص</h2>
          <div role="radiogroup" aria-labelledby="size-title" className="grid grid-cols-2 gap-2">
            {SIZES.map(([v, label, pct]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={prefs.size === v}
                onClick={() => update({ size: v })}
                className={`rounded-2xl border-2 p-3 min-h-[4.5rem] flex flex-col items-center justify-center gap-0.5 ${prefs.size === v ? "border-accent bg-accent-soft text-ink" : "border-line text-ink"}`}
              >
                <span className="font-display font-bold" style={{ fontSize: `${1 + v * 0.2}rem` }}>أ ب ت</span>
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-ink-soft num">{pct}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="الألوان والخط" className="flex flex-col gap-2.5">
          <Toggle icon="eye" title="تباين عالٍ" hint="خلفية بيضاء ونص أسود صافٍ، وألوان أغمق وحدود أوضح." on={prefs.contrast} onChange={(v) => update({ contrast: v })} />
          <Toggle icon="pencil" title="نص عريض" hint="كل الخطوط أثقل وأوضح." on={prefs.bold} onChange={(v) => update({ bold: v })} />
          <Toggle icon="chevronLeft" title="روابط تحتها خط" hint="لتمييز الروابط دون الاعتماد على اللون." on={prefs.links} onChange={(v) => update({ links: v })} />
          <Toggle icon={isDark ? "moon" : "sun"} title="الوضع الداكن" hint="خلفية داكنة ونص أبيض — مريح في الإضاءة الخافتة." on={isDark} onChange={() => toggle()} />
        </section>

        <section aria-label="معاينة" className="bg-white rounded-3xl shadow p-4 sm:p-5">
          <p className="text-xs text-muted mb-1">معاينة</p>
          <p className="font-bold text-ink text-lg">فاتورة رقم 2041 — بقالة الأمل</p>
          <p className="text-ink-soft">طحنية سادة 400 جم × 12 — <span className="num font-bold text-ink">52,000</span></p>
          <p className="text-sm text-accent-ink font-semibold mt-1">مدفوعة بالكامل</p>
        </section>

        <button type="button" onClick={reset} className="h-12 rounded-xl border-2 border-line text-ink font-semibold">
          إعادة الإعدادات الافتراضية
        </button>
      </main>
    </div>
  );
}
