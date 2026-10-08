const admin = require("firebase-admin");

// Service account credentials come from env vars — never commit the JSON file.
// Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local
// (FIREBASE_PRIVATE_KEY needs its \n characters preserved — see README).
if (!admin.apps.length && process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_PRIVATE_KEY) {
  // Local / CI tests against the Firebase Emulator (npm run test:emulator):
  // no credentials needed — never the case on Vercel, where the key is set.
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "demo-mubashir" });
} else if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const adminAuth = admin.auth();
const adminDb = admin.firestore();

module.exports = { admin, adminAuth, adminDb };
