// Firebase App Check on the device — proves requests come from THIS app
// in a real browser, not a script with a stolen login. Off unless
// NEXT_PUBLIC_APPCHECK_SITE_KEY (a reCAPTCHA Enterprise site key) is set at
// build time; then the App Check code is a separate download fetched on
// first use, and every API call carries an X-Firebase-AppCheck header that
// the server checks (lib/appCheckServer.js).

let appCheckPromise = null;

function ensureAppCheck() {
  const siteKey = process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY;
  if (!siteKey || typeof window === "undefined") return Promise.resolve(null);
  if (!appCheckPromise) {
    appCheckPromise = Promise.all([import("firebase/app-check"), import("./firebaseClient")])
      .then(([mod, { app }]) => ({
        mod,
        appCheck: mod.initializeAppCheck(app, { provider: new mod.ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true }),
      }))
      .catch((err) => {
        console.warn("[appCheck] not started:", err.message);
        return null;
      });
  }
  return appCheckPromise;
}

/** Header for API calls: { "X-Firebase-AppCheck": token } or {} when off/unavailable. */
async function appCheckHeader() {
  const ready = await ensureAppCheck();
  if (!ready) return {};
  try {
    const { token } = await ready.mod.getToken(ready.appCheck, false);
    return token ? { "X-Firebase-AppCheck": token } : {};
  } catch {
    return {}; // the server decides (monitor mode lets it through)
  }
}

module.exports = { ensureAppCheck, appCheckHeader };
