import { useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { PageLoading } from "../components/Loading";
import { ROLE_HOME, normalizeRole } from "../lib/roles";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      const tokenResult = await u.getIdTokenResult();
      const role = normalizeRole(tokenResult.claims.role);
      router.replace(ROLE_HOME[role] || "/login");
    });
    return () => unsub();
  }, [router]);

  return <PageLoading />;
}
