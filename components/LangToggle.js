import { setLang, useLang } from "../lib/i18n";

// One tap switches the whole interface between Arabic and English.
// The label is always shown in the OTHER language, so it's findable by
// someone who can't read the current one.
export default function LangToggle({ className = "" }) {
  const lang = useLang();
  const next = lang === "en" ? "ar" : "en";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      data-no-translate
      lang={next}
      aria-label={next === "en" ? "Switch to English" : "التبديل إلى العربية"}
      title={next === "en" ? "English" : "العربية"}
      className={`h-11 min-w-[44px] px-2.5 rounded-xl flex items-center justify-center text-sm font-bold text-ink-soft hover:bg-surface-2 active:bg-surface-2 ${className}`}
    >
      {next === "en" ? "EN" : "ع"}
    </button>
  );
}
