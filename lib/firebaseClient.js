import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Values come from your Firebase project settings.
// Store these in .env.local (and in Vercel's Environment Variables for
// deployment) as NEXT_PUBLIC_FIREBASE_* variables.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Every page in this app that uses Firebase Auth does so client-side only
// (via useAuth's useEffect), but Next.js's Pages Router still executes
// each page component once in Node during the build, to pre-render a
// static HTML shell — even for pages with no server data. Initializing
// Firebase unconditionally at module load time means that build-time
// execution also tries to create a real Auth instance, which throws
// "auth/invalid-api-key" in Node if the env vars aren't present in that
// build environment (a very easy thing to get wrong on a host like
// Vercel). Guarding with typeof window skips initialization during that
// build-time pass entirely — real initialization still happens normally
// the moment this module loads in an actual browser.
let auth, db;

if (typeof window !== "undefined") {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
