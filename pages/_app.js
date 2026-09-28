import Head from "next/head";
import "../styles/globals.css";
import { useEffect } from "react";
import ConnectionBanner from "../components/ConnectionBanner";

export default function App({ Component, pageProps }) {
  // Service worker: lets the app open even with no internet (see
  // public/sw.js). Production only — in development it would serve stale
  // code while editing.
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
      <Component {...pageProps} />
    </>
  );
}
