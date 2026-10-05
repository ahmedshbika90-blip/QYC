import { Html, Head, Main, NextScript } from "next/document";
import { LANG_BOOTSTRAP } from "../lib/i18n";

// Runs before first paint so a saved dark preference never flashes white.
// Kept tiny and dependency-free on purpose — it is inlined into every page.
const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem('masar-theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#0D1310':'#F4F1EA');}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="ar" dir="rtl">
      <Head>
        <meta name="theme-color" content="#F4F1EA" />
        {/* Alexandria: display face for headings and figures.
            IBM Plex Sans Arabic: body text — very legible at small sizes
            and on low-end screens, with clean Latin digits for prices/IDs. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Alexandria:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
