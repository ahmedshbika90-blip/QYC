import Head from "next/head";
import "../styles/globals.css";
import OfflineBanner from "../components/OfflineBanner";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* maximum-scale=1 prevents iOS auto-zooming into text inputs, which
            is a common annoyance on touch forms; user-scalable stays enabled
            for accessibility (pinch-zoom still works). */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </Head>
      <OfflineBanner />
      <Component {...pageProps} />
    </>
  );
}
