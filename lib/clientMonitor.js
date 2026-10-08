// Browser error reporting to Sentry — only when NEXT_PUBLIC_SENTRY_DSN is
// set at build time. The Sentry code is a separate download, fetched after
// the page has loaded and only in that case, so phones pay nothing when
// it's off and the first paint never waits for it. Same scrubbing as the
// server (lib/scrub.js): no names, phones, emails, query strings, typed
// text, or user ids leave the device.
import { scrubEvent } from "./scrub";

let started = false;

export function startClientMonitor() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || started || typeof window === "undefined") return;
  started = true;
  const go = () =>
    import("@sentry/nextjs")
      .then((Sentry) =>
        Sentry.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
          sendDefaultPii: false,
          tracesSampleRate: 0,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          beforeSend: scrubEvent,
          // Network noise from weak connections is shown to the user already.
          ignoreErrors: ["Failed to fetch", "NetworkError", "Load failed", "AbortError", "ChunkLoadError"],
        })
      )
      .catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 5000 });
  else setTimeout(go, 3000);
}
