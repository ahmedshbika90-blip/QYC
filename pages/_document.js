import { Html, Head, Main, NextScript } from "next/document";
import { LANG_BOOTSTRAP } from "../lib/i18n";

// Runs before first paint so a saved dark preference never flashes white.
// Kept tiny and dependency-free on purpose — it is inlined into every page.
const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem('masar-theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#0D1310':'#F4F1EA');var a=JSON.parse(localStorage.getItem('mubashir-a11y')||'{}');if(a.size>0)r.classList.add('a11y-size-'+a.size);if(a.bold)r.classList.add('a11y-bold');if(a.contrast)r.classList.add('a11y-contrast');if(a.links)r.classList.add('a11y-links');}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="ar" dir="rtl">
      <Head>
        <meta name="theme-color" content="#F4F1EA" />
        {/* Fonts (Alexandria for headings and figures, IBM Plex Sans Arabic
            for body text) are self-hosted — see pages/_app.js. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {/* English/Arabic: sets dir before first paint (lib/i18n.js). */}
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOTSTRAP }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
