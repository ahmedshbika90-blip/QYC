// Arabic ⇄ English switch for the whole app.
//
// The interface is written in Arabic. English mode is a translation layer
// over the rendered page: every fixed piece of interface text (labels,
// buttons, headings, messages from the server, placeholders, tooltips) is
// looked up in lib/i18nDict.js and swapped in place, and the page flips to
// left-to-right. What people typed — client names, notes, product names —
// is never touched (unless a product name is itself a dictionary word).
//
// Why a layer instead of rewriting every screen around t("key"): the app
// has ~1,000 strings across ~90 files; this keeps them where they are,
// covers all of them at once, and new Arabic text only needs a dictionary
// line (the dev check below lists any that are missing).
//
// The choice is per device (localStorage), applied before first paint by
// the script in pages/_document.js, so English pages never flash Arabic.

import { useEffect, useState } from "react";
import { getLang, setLangState } from "./langState";
import { subscribeAuth } from "./currentToken";

export { getLang, locale } from "./langState";

const KEY = "mubasher-lang";
const AR = /[\u0600-\u06FF]/;
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE"]);

const listeners = new Set();

/* ── translation of a single string ─────────────────────────────────────── */

// The dictionary (~80 KB) is only downloaded when English is chosen, so
// Arabic users on a slow connection never pay for it.
let DICT = {};
let WORDS = {};
let compiled = [];
let dictPromise = null;

function compile(patterns) {
  return patterns.map(([src, en]) => {
    // "{0}" placeholders → lazy groups; everything else literal.
    const order = [];
    const re = src
      .split(/(\{\d+\})/)
      .map((p) => {
        const m = p.match(/^\{(\d+)\}$/);
        if (m) {
          order.push(Number(m[1]));
          return "(.+?)";
        }
        return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
      })
      .join("");
    return { re: new RegExp(`^${re}$`, "s"), order, en };
  });
}

// Names people typed in English (products, staff) — fetched with the
// dictionary and merged into it; see /api/i18n/terms.
let termsLoadedFor = null;
async function loadTerms() {
  const { token, uid } = currentAuth;
  if (!token || termsLoadedFor === uid) return;
  try {
    const res = await fetch("/api/i18n/terms", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const { terms } = await res.json();
    DICT = { ...DICT, ...terms };
    termsLoadedFor = uid;
    cache.clear();
    if (observer) walk(document.body);
  } catch {
    // offline — product names stay as typed
  }
}
let currentAuth = { token: null, uid: null };
subscribeAuth((a) => {
  currentAuth = a || { token: null, uid: null };
  if (getLang() === "en" && dictPromise) dictPromise.then(loadTerms).catch(() => {});
});

export function loadDict() {
  if (!dictPromise) {
    dictPromise = import("./i18nDict")
      .then((m) => {
        DICT = { ...m.DICT, ...DICT };
        WORDS = m.WORDS;
        compiled = compile(m.PATTERNS);
        cache.clear();
        missing.clear();
      })
      .catch((err) => {
        dictPromise = null; // offline: try again on the next switch / page
        throw err;
      });
  }
  return dictPromise;
}

const DELIMS = [" · ", " — ", "، ", ": ", " - ", " | ", " / "];

function translateCore(key, depth = 0) {
  if (!AR.test(key)) return key;
  if (DICT[key] !== undefined) return DICT[key];
  // Common harmless variations: trailing punctuation / ellipsis / colon.
  const m = key.match(/^(.*?)([.:،؟!…]+|\.\.\.)$/s);
  if (m && DICT[m[1].trim()] !== undefined) return DICT[m[1].trim()] + m[2].replace("،", ",").replace("؟", "?");
  for (const p of compiled) {
    const hit = key.match(p.re);
    if (!hit) continue;
    return p.en.replace(/\{(\d+)\}/g, (_, i) => {
      const v = hit[p.order.indexOf(Number(i)) + 1] ?? "";
      // A value that isn't a dictionary word (a client's name) stays as typed.
      return depth < 2 ? translateCore(v.trim(), depth + 1) ?? v : v;
    });
  }
  if (depth < 2) {
    for (const d of DELIMS) {
      if (!key.includes(d)) continue;
      const pieces = key.split(d).map((x) => translateCore(x.trim(), depth + 1));
      if (pieces.every((x) => !AR.test(x))) return pieces.join(d.replace("،", ","));
    }
  }
  // Dates, weekdays, "ص/م" and other single words (e.g. "5 أكتوبر 2026").
  const words = key.split(/(\s+)/).map((w) => (WORDS[w] !== undefined ? WORDS[w] : DICT[w] !== undefined ? DICT[w] : w));
  const joined = words.join("");
  if (!AR.test(joined)) return joined.replace(/،/g, ",");
  return null;
}

const cache = new Map();
export function translate(text) {
  if (!text || !AR.test(text)) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  const key = text.replace(/\s+/g, " ").trim();
  let out = cache.get(key);
  if (out === undefined) {
    out = translateCore(key);
    cache.set(key, out);
    if (out === null && process.env.NODE_ENV !== "production") missing.add(key);
  }
  return out === null ? text : lead + out + trail;
}

/** For code that builds a string itself (e.g. window.confirm). */
export function t(text) {
  return getLang() === "en" ? translate(text) : text;
}

/* ── live DOM translation ──────────────────────────────────────────────── */

const missing = new Set();
const textOrig = new WeakMap(); // Text node → { ar, en }
const attrOrig = new WeakMap(); // Element → { [attr]: { ar, en } }
let observer = null;

function skip(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (SKIP_TAGS.has(n.tagName) || n.isContentEditable || n.hasAttribute("data-no-translate")) return true;
  }
  return false;
}

function doText(node) {
  const value = node.nodeValue;
  const rec = textOrig.get(node);
  if (rec && value === rec.en) return; // our own write
  if (!AR.test(value)) return;
  if (node.parentElement && skip(node.parentElement)) return;
  const en = translate(value);
  if (en === value) return;
  textOrig.set(node, { ar: value, en });
  node.nodeValue = en;
}

function doAttrs(el) {
  if (skip(el)) return;
  let rec = attrOrig.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !AR.test(v)) continue;
    if (rec && rec[a] && rec[a].en === v) continue;
    const en = translate(v);
    if (en === v) continue;
    rec = rec || {};
    rec[a] = { ar: v, en };
    attrOrig.set(el, rec);
    el.setAttribute(a, en);
  }
}

function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 || SKIP_TAGS.has(root.tagName)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) doText(n);
    else doAttrs(n);
  }
}

async function startTranslating() {
  if (observer || typeof document === "undefined") return;
  await loadDict();
  if (observer || getLang() !== "en") return;
  walk(document.body);
  loadTerms();
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") doText(r.target);
      else if (r.type === "attributes") doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

function stopTranslating() {
  if (observer) observer.disconnect();
  observer = null;
  // Put the Arabic back on everything we changed that's still on screen.
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) {
      const rec = textOrig.get(n);
      if (rec && n.nodeValue === rec.en) n.nodeValue = rec.ar;
    } else {
      const rec = attrOrig.get(n);
      if (rec) for (const [a, v] of Object.entries(rec)) if (n.getAttribute(a) === v.en) n.setAttribute(a, v.ar);
    }
  }
}

function applyDocument(next) {
  const html = document.documentElement;
  html.lang = next;
  html.dir = next === "en" ? "ltr" : "rtl";
}

export function setLang(next) {
  if (next !== "en" && next !== "ar") return;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // private mode — still switch for this visit
  }
  if (next === getLang()) return;
  setLangState(next);
  applyDocument(next);
  if (next === "en") startTranslating().catch(() => {});
  else stopTranslating();
  listeners.forEach((fn) => fn(next));
}

/** Called once on app start (pages/_app.js). */
export function initLang() {
  if (typeof window === "undefined") return;
  let saved = "ar";
  try {
    saved = localStorage.getItem(KEY) === "en" ? "en" : "ar";
  } catch {
    // ignore
  }
  setLangState(saved);
  applyDocument(saved);
  // Browser dialogs (confirm / prompt / alert) are built from strings in
  // code, not the page — translate their message on the way out.
  for (const name of ["confirm", "prompt", "alert"]) {
    const native = window[name].bind(window);
    window[name] = (message, ...rest) => native(typeof message === "string" ? t(message) : message, ...rest);
  }
  if (saved === "en") startTranslating().catch(() => {});
  if (process.env.NODE_ENV !== "production") {
    window.__i18nMissing = () => [...missing];
  }
}

/** Re-renders a component when the language changes (for dates, charts). */
export function useLang() {
  const [l, setL] = useState("ar");
  useEffect(() => {
    setL(getLang());
    listeners.add(setL);
    return () => listeners.delete(setL);
  }, []);
  return l;
}

// The script pages/_document.js inlines so the right direction is set
// before the first paint.
export const LANG_BOOTSTRAP = `(function(){try{if(localStorage.getItem('${KEY}')==='en'){var r=document.documentElement;r.lang='en';r.dir='ltr';}}catch(e){}})();`;
