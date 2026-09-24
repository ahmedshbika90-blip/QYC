import { useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebaseClient";
import { PageLoading } from "../components/Loading";

const ROLE_HOME = {
  agent_car1: "/dashboard/car1",
  agent_car2: "/dashboard/car2",
  supervisor: "/dashboard/supervisor",
};

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      const tokenResult = await u.getIdTokenResult();
      const role = tokenResult.claims.role;
      router.replace(ROLE_HOME[role] || "/login");
    });
    return () => unsub();
  }, [router]);

  return <PageLoading />;
}
