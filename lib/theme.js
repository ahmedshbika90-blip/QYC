import { useCallback, useEffect, useState } from "react";

// Theme preference: "light" | "dark" | "system" (default).
// Stored per device — a warehouse tablet and an agent's phone can differ.
const KEY = "masar-theme";
const listeners = new Set();

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readPref() {
  try {
    return localStorage.getItem(KEY) || "system";
  } catch {
    return "system";
  }
}

function apply(pref, animate) {
  const root = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 220);
  }
  root.classList.toggle("dark", dark);
  const meta = document.querySelector("meta[name=theme-color]");
  if (meta) meta.setAttribute("content", dark ? "#0D1310" : "#F4F1EA");
  return dark;
}

export function useTheme() {
  const [pref, setPref] = useState("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const p = readPref();
    setPref(p);
    setIsDark(document.documentElement.classList.contains("dark"));

    const sync = (next) => {
      setPref(next);
      setIsDark(apply(next, false));
    };
    listeners.add(sync);

    // Follow the OS setting live while on "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOs = () => {
      if (readPref() === "system") setIsDark(apply("system", true));
    };
    mq.addEventListener?.("change", onOs);
    return () => {
      listeners.delete(sync);
      mq.removeEventListener?.("change", onOs);
    };
  }, []);

  const choose = useCallback((next) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private browsing — still applies for this page view
    }
    apply(next, true);
    listeners.forEach((fn) => fn(next));
  }, []);

  // One-tap toggle: flips the current appearance and pins it.
  const toggle = useCallback(() => {
    choose(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [choose]);

  return { pref, isDark, choose, toggle };
}
