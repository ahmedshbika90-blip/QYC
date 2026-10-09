import { useAuth } from "../lib/useAuth";
import { useA11y } from "../lib/a11y";
import { useTheme } from "../lib/theme";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import Icon from "../components/Icon";
import { PageLoading } from "../components/Loading";

// سهولة القراءة — each person sets how the app looks on THEIR phone.
// Built to hold together on the smallest phone at the largest settings:
// one column, every row wraps, nothing has a fixed width, the switch never
// squeezes the text.
const SIZES = [
  [0, "عادي"],
  [1, "كبير"],
  [2, "أكبر"],
  [3, "كبير جدًا"],
];

function Switch({ on }) {
  return (
    <span aria-hidden="true" className={`w-[52px] h-[30px] rounded-full p-[3px] shrink-0 flex ${on ? "bg-accent justify-end" : "bg-gray-300 justify-start"}`}>
      <span className="block w-[24px] h-[24px] rounded-full bg-snow shadow" />
    </span>
  );
}

function Option({ title, hint, on, onChange }) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`w-full text-start rounded-2xl border-2 px-4 py-3.5 flex items-center gap-3 ${on ? "border-accent bg-accent-soft" : "border-line bg-white"}`}
      >
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-ink text-base break-words">{title}</span>
          <span className="block text-sm text-ink-soft mt-0.5 break-words">{hint}</span>
        </span>
        <Switch on={on} />
      </button>
    </li>
  );
}

export default function Accessibility() {
  const { role, loading, logout } = useAuth();
  const { prefs, update, reset } = useA11y();
  const { isDark, toggle } = useTheme();
  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-xl mx-auto px-3 sm:px-6 pt-4 pb-10 flex flex-col gap-5">
        <div className="min-w-0">
          <BackButton />
          <h1 className="font-display text-2xl font-bold text-ink mt-1 break-words">سهولة القراءة</h1>
          <p className="text-ink-soft mt-1 break-words">اختر ما يريح عينيك. يُحفظ على هذا الجهاز ويُطبَّق فورًا على كل الصفحات.</p>
        </div>

        <section aria-labelledby="size-title" className="bg-white rounded-3xl shadow p-4 flex flex-col gap-3 min-w-0">
          <h2 id="size-title" className="font-bold text-ink text-lg">حجم النص</h2>
          <div role="radiogroup" aria-labelledby="size-title" className="grid grid-cols-2 gap-2">
            {SIZES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={prefs.size === v}
                onClick={() => update({ size: v })}
                className={`min-w-0 rounded-2xl border-2 px-2 py-3 flex flex-col items-center justify-center gap-1 ${prefs.size === v ? "border-accent bg-accent-soft" : "border-line"}`}
              >
                <span aria-hidden="true" className="font-display font-bold text-ink leading-none" style={{ fontSize: `${18 + v * 4}px` }}>أ ب</span>
                <span className="text-sm font-semibold text-ink break-words text-center">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="look-title" className="flex flex-col gap-2.5 min-w-0">
          <h2 id="look-title" className="font-bold text-ink text-lg px-1">الوضوح</h2>
          <ul className="flex flex-col gap-2.5">
            <Option title="تكبير النصوص الصغيرة" hint="أسماء الحقول والملاحظات الصغيرة والنص داخل الحقول." on={prefs.small} onChange={(v) => update({ small: v })} />
            <Option title="حدود أسمك للحقول" hint="حواف الحقول أعرض وأغمق ليسهل رؤيتها." on={prefs.borders} onChange={(v) => update({ borders: v })} />
            <Option title="تباين عالٍ" hint="خلفية بيضاء ونص أسود صافٍ، وألوان أغمق." on={prefs.contrast} onChange={(v) => update({ contrast: v })} />
            <Option title="نص عريض" hint="كل الخطوط أثقل وأوضح." on={prefs.bold} onChange={(v) => update({ bold: v })} />
            <Option title="روابط تحتها خط" hint="لتمييز الروابط دون الاعتماد على اللون." on={prefs.links} onChange={(v) => update({ links: v })} />
            <Option title="الوضع الداكن" hint="خلفية داكنة ونص أبيض — مريح في الإضاءة الخافتة." on={isDark} onChange={() => toggle()} />
          </ul>
        </section>

        <section aria-label="معاينة" className="bg-white rounded-3xl shadow p-4 min-w-0">
          <p className="text-xs text-ink-soft mb-2">معاينة</p>
          <label className="block text-sm text-ink-soft mb-1">اسم العميل</label>
          <input readOnly value="بقالة الأمل" className="w-full border border-line rounded-xl px-3 h-12 text-base mb-3 bg-white" />
          <p className="font-bold text-ink text-lg break-words">فاتورة INV-2026-000041</p>
          <p className="text-ink-soft break-words">طحنية سادة 400 جم × 12 — <span className="num font-bold text-ink">52,000</span></p>
        </section>

        <button type="button" onClick={reset} className="h-12 rounded-xl border-2 border-line text-ink font-semibold flex items-center justify-center gap-2">
          <Icon name="refresh" size={18} />
          إعادة الإعدادات الافتراضية
        </button>
      </main>
    </div>
  );
}
