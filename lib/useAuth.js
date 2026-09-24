import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebaseClient";

const ROLE_HOME = {
  agent_car1: "/dashboard/car1",
  agent_car2: "/dashboard/car2",
  supervisor: "/dashboard/supervisor",
};

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
      const tokenResult = await u.getIdTokenResult();
      const userRole = tokenResult.claims.role || null;

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

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  return { user, role, token, loading, logout };
}
