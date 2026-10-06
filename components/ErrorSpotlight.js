import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Makes sure an error is SEEN. Pages show their errors next to the form or
// list they belong to; when that spot is off-screen (the person scrolled),
// this mirrors the message in a floating banner under the top bar. Tap it
// to jump to the error; it leaves on its own once the error is on screen,
// removed, or after a few seconds.
//
// Works for every page without changes there: it watches for elements with
// role="alert" or the red error text style.
const SELECTOR = '[role="alert"], p.text-red-600';
const HIDE_AFTER_MS = 7000;

function candidates() {
  return [...document.querySelectorAll(SELECTOR)].filter(
    (el) => !el.closest("button, nav, [data-error-spotlight], [data-no-spotlight]") && el.offsetParent !== null && el.textContent.trim()
  );
}

function offScreen(el) {
  const r = el.getBoundingClientRect();
  return r.bottom < 72 || r.top > window.innerHeight - 8;
}

export default function ErrorSpotlight() {
  const [shown, setShown] = useState(null); // { el, text }
  const seen = useRef(new WeakMap()); // element → last text announced
  const timer = useRef(null);

  useEffect(() => {
    let pending = null;
    function scan() {
      pending = null;
      for (const el of candidates()) {
        const text = el.textContent.trim().replace(/\s+/g, " ");
        if (seen.current.get(el) === text) continue;
        seen.current.set(el, text);
        if (offScreen(el)) {
          setShown({ el, text });
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setShown(null), HIDE_AFTER_MS);
        }
      }
    }
    const mo = new MutationObserver(() => {
      if (!pending) pending = setTimeout(scan, 120);
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => {
      mo.disconnect();
      clearTimeout(pending);
      clearTimeout(timer.current);
    };
  }, []);

  // Leave once the error itself is visible or gone.
  useEffect(() => {
    if (!shown) return;
    const check = () => {
      if (!document.body.contains(shown.el) || !offScreen(shown.el)) setShown(null);
    };
    window.addEventListener("scroll", check, { passive: true });
    const iv = setInterval(check, 500);
    return () => {
      window.removeEventListener("scroll", check);
      clearInterval(iv);
    };
  }, [shown]);

  if (!shown) return null;
  return (
    <div data-error-spotlight className="fixed inset-x-0 top-[4.5rem] z-40 flex justify-center px-4 pointer-events-none">
      <button
        type="button"
        onClick={() => {
          shown.el.scrollIntoView({ behavior: "smooth", block: "center" });
          setShown(null);
        }}
        style={{ animation: "toast-in 200ms ease-out both" }}
        className="pointer-events-auto max-w-lg w-full flex items-start gap-2.5 text-start rounded-2xl bg-red-600 text-white shadow-lg px-4 py-3"
      >
        <Icon name="alert" size={20} className="mt-0.5" />
        <span className="flex-1 text-sm font-semibold leading-relaxed">{shown.text}</span>
        <span className="text-xs opacity-90 underline shrink-0 mt-0.5">عرض</span>
      </button>
    </div>
  );
}
