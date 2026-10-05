import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, onIdTokenChanged, signOut } from "firebase/auth";
import { auth } from "./firebaseClient";
import { clearLocalData } from "./clientsStore";
import { invalidate } from "./apiCache";
import { markActivity, isSessionExpired, clearSession } from "./session";
import { stopLiveVersions } from "./liveVersions";
import { setCurrentAuth } from "./currentToken";
import { ROLE_HOME, normalizeRole } from "./roles";

// 10 minutes of inactivity per device (see lib/session.js for why this is
// stored on the device rather than in a page timer).
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"];
const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 15 * 1000;

async function endSession(router, reason) {
  clearLocalData();
  invalidate("");
  clearSession();
  stopLiveVersions();
  setCurrentAuth({ token: null, uid: null });
  try {
    sessionStorage.removeItem("pendingActionsSeen");
  } catch {
    // ignore — private browsing etc.
  }
  await signOut(auth);
  router.push(reason ? `/login?reason=${reason}` : "/login");
}

// Client-side hook: tracks the logged-in staff/agent user, their role,
// and a ready-to-use ID token for calling the API routes.
// Redirects to /login if no user is signed in.
//
// Pass allowedRoles to also enforce that ONLY those roles may view this
// page — anyone else (wrong role, or no role at all) is redirected to
// their own dashboard instead of seeing this page's shell. This is a
// UX/defense-in-depth layer on top of the real protection, which is the
// server-side role check every API route already performs — a wrong-role
// user redirected away here could never have fetched real data anyway.
export function useAuth(allowedRoles) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setLoading(false);
        router.push("/login");
        return;
      }
      // Checked before anything loads: if this device has been idle past
      // the timeout (e.g. reopened the next day), end the session here.
      if (isSessionExpired()) {
        await endSession(router, "idle");
        return;
      }
      markActivity();

      let tokenResult;
      try {
        tokenResult = await u.getIdTokenResult();
      } catch {
        // Opened with no connection and the saved login token needs
        // renewing — that requires the network. Keep the loading screen
        // (the connection banner explains why) and retry the moment the
        // connection returns.
        const retry = () => {
          window.removeEventListener("online", retry);
          u.getIdTokenResult()
            .then(() => window.location.reload())
            .catch(() => window.addEventListener("online", retry));
        };
        window.addEventListener("online", retry);
        return;
      }
      const userRole = normalizeRole(tokenResult.claims.role);

      if (allowedRoles && !allowedRoles.includes(userRole)) {
        router.push(ROLE_HOME[userRole] || "/login");
        return;
      }

      setUser(u);
      setRole(userRole);
      setToken(tokenResult.token);
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Login tokens last 1 hour. Keep the one pages use fresh, so a page left
  // open for hours (e.g. placing invoices all morning) never starts failing
  // with "expired token".
  useEffect(() => {
    if (!user) return;
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (u) setToken(await u.getIdToken());
    });
    const refresh = setInterval(() => {
      auth.currentUser?.getIdToken().then(setToken).catch(() => {});
    }, 10 * 60 * 1000);
    return () => {
      unsub();
      clearInterval(refresh);
    };
  }, [user]);

  // While the app is open: record activity (throttled), re-check every 30
  // seconds, and re-check immediately when the app returns to the screen —
  // background tabs and locked phones pause timers, so that return moment
  // is exactly when an expired session must be caught.
  useEffect(() => {
    if (!user) return;

    let lastWrite = 0;
    function onActivity() {
      const now = Date.now();
      if (now - lastWrite > ACTIVITY_WRITE_THROTTLE_MS) {
        lastWrite = now;
        markActivity();
      }
    }
    function check() {
      if (isSessionExpired()) endSession(router, "idle");
    }
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // The server refused this login (lib/apiFetch.js → "auth-rejected"). Try
  // one forced token renewal: that fixes a merely stale token, and FAILS if
  // the admin disabled the account or reset its sessions — then sign out.
  // A renewed token whose role changed also signs out, so the person comes
  // back in on the right home page instead of a page they can't use.
  useEffect(() => {
    if (!user) return;
    let busy = false;
    async function onRejected() {
      if (busy) return;
      busy = true;
      try {
        const res = await auth.currentUser?.getIdTokenResult(true);
        if (!res || normalizeRole(res.claims.role) !== role) await endSession(router, "revoked");
        else setToken(res.token);
      } catch {
        if (navigator.onLine) await endSession(router, "revoked");
      } finally {
        busy = false;
      }
    }
    window.addEventListener("auth-rejected", onRejected);
    return () => window.removeEventListener("auth-rejected", onRejected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  async function logout() {
    // Cached client names/phones and API responses shouldn't outlive the
    // session on a shared or handed-around device.
    await endSession(router);
  }

  // Published for components that need the current token/uid but aren't
  // handed them as props (currently just Nav, for the notifications
  // badge) — see lib/currentToken.js.
  useEffect(() => {
    setCurrentAuth({ token, uid: user?.uid || null });
  }, [token, user]);

  return { user, role, token, loading, logout };
}
