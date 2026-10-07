// Fonts are served from our own domain (npm @fontsource packages, bundled
// under /_next/static/media): no render-blocking stylesheet from
// fonts.googleapis.com, no extra connection to Google on a weak line, and
// the service worker keeps them for offline use. Same faces and weights as
// before; each weight is split by script (unicode-range), so a phone only
// downloads the Arabic and Latin files it actually needs.
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/alexandria/500.css";
import "@fontsource/alexandria/600.css";
import "@fontsource/alexandria/700.css";
import Head from "next/head";
import "../styles/globals.css";
import { useEffect } from "react";
import ConnectionBanner from "../components/ConnectionBanner";
import ErrorSpotlight from "../components/ErrorSpotlight";
import { initLang } from "../lib/i18n";

export default function App({ Component, pageProps }) {
  // Service worker: lets the app open even with no internet (see
  // public/sw.js). Production only — in development it would serve stale
  // code while editing.
  // Interface language (Arabic by default, English on request) — applied
  // after hydration so React's first render always matches the server's.
  useEffect(() => {
    initLang();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <>
      <Head>
        {/* maximum-scale=1 prevents iOS auto-zooming into text inputs, which
            is a common annoyance on touch forms; user-scalable stays enabled
            for accessibility (pinch-zoom still works). */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </Head>
      <ConnectionBanner />
      <ErrorSpotlight />
      <Component {...pageProps} />
    </>
  );
}
