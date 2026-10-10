import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { useTheme } from "../lib/theme";
import { setLang, useLang } from "../lib/i18n";
import { ROLE_LABELS } from "../lib/labels";

// One quiet button in the top bar instead of several icons. It opens a small
// menu with what a person sets for themselves: night mode (one tap, right
// there), language, reading settings — and signing out.
export default function AccountMenu({ role, name, onLogout }) {
  const [open, setOpen] = useState(false);
  const { isDark, toggle } = useTheme();
  const lang = useLang();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const initial = (name || ROLE_LABELS[role] || "?").trim().charAt(0);
  const row = "w-full min-h-[48px] px-4 flex items-center gap-3 text-start text-ink hover:bg-surface-2 active:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="حسابي والإعدادات"
        className="w-[44px] h-[44px] rounded-full bg-accent-soft text-accent-ink font-display font-bold text-lg flex items-center justify-center hover:ring-2 hover:ring-accent/40"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-[52px] z-50 w-[min(18rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-xl border border-line overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <p className="font-bold text-ink truncate">{name || ROLE_LABELS[role] || ""}</p>
            {name && <p className="text-sm text-ink-soft truncate">{ROLE_LABELS[role] || ""}</p>}
          </div>
          <button type="button" role="menuitemcheckbox" aria-checked={isDark} onClick={toggle} className={row}>
            <Icon name={isDark ? "sun" : "moon"} size={20} className="text-ink-soft" />
            <span className="flex-1">الوضع الداكن</span>
            <span aria-hidden="true" className={`w-[42px] h-[24px] rounded-full p-[3px] flex ${isDark ? "bg-accent justify-end" : "bg-gray-300 justify-start"}`}>
              <span className="block w-[18px] h-[18px] rounded-full bg-snow shadow" />
            </span>
          </button>
          <div className={`${row} cursor-default hover:bg-transparent`} role="group" aria-label="اللغة">
            <Icon name="globe" size={20} className="text-ink-soft" />
            <span className="flex-1">اللغة</span>
            <span className="inline-flex p-0.5 rounded-lg bg-surface-2" data-no-translate>
              {[["ar", "ع"], ["en", "EN"]].map(([v, l]) => (
                <button key={v} type="button" role="menuitemradio" aria-checked={lang === v} onClick={() => setLang(v)} lang={v} className={`h-8 px-3 rounded-md text-sm font-bold ${lang === v ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}>
                  {l}
                </button>
              ))}
            </span>
          </div>
          <Link href="/accessibility" role="menuitem" className={row} onClick={() => setOpen(false)}>
            <span aria-hidden="true" className="w-5 text-center font-display font-bold text-ink-soft">أأ</span>
            <span className="flex-1">سهولة القراءة</span>
            <Icon name="chevronLeft" size={18} className="text-ink-soft rtl-flip" />
          </Link>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }} className={`${row} border-t border-line text-red-700`}>
            <Icon name="logout" size={20} />
            <span className="flex-1">تسجيل الخروج</span>
          </button>
        </div>
      )}
    </div>
  );
}
