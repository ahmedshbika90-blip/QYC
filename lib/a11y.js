import { useCallback, useEffect, useState } from "react";

// Reading settings, chosen by each person on their own device
// (/accessibility): text size, bigger small text (labels, hints, text inside
// fields), thicker field borders, bolder text, high contrast, underlined
// links.
// Stored on the device (works offline, costs nothing) and applied to <html>
// before the first paint by the script in pages/_document.js, so the page
// never flashes small text first.
export const A11Y_KEY = "mubashir-a11y";
export const DEFAULTS = { size: 0, small: false, borders: false, bold: false, contrast: false, links: false };
const listeners = new Set();

export function readA11y() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(A11Y_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyA11y(p) {
  const c = document.documentElement.classList;
  [1, 2, 3].forEach((n) => c.toggle(`a11y-size-${n}`, p.size === n));
  c.toggle("a11y-bold", !!p.bold);
  c.toggle("a11y-contrast", !!p.contrast);
  c.toggle("a11y-links", !!p.links);
  c.toggle("a11y-small", !!p.small);
  c.toggle("a11y-borders", !!p.borders);
}

export function useA11y() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  useEffect(() => {
    setPrefs(readA11y());
    const on = (p) => setPrefs(p);
    listeners.add(on);
    return () => listeners.delete(on);
  }, []);
  const update = useCallback((patch) => {
    const next = { ...readA11y(), ...patch };
    try {
      localStorage.setItem(A11Y_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: still applies for this visit
    }
    applyA11y(next);
    listeners.forEach((l) => l(next));
  }, []);
  const reset = useCallback(() => update({ ...DEFAULTS }), [update]);
  return { prefs, update, reset };
}
