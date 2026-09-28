import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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
// Auth runs in the browser. All business data goes through the server API
// routes (Admin SDK). The one exception is a read-only live listener on the
// change-counter document meta/versions (see lib/liveVersions.js) — it holds
// plain numbers only, and firestore.rules allows exactly that one document.
let app;
let auth;

if (typeof window !== "undefined") {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
}

export { app, auth };
