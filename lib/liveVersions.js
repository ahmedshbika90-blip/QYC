import { app } from "./firebaseClient";

// One shared real-time listener on meta/versions (the change counters from
// lib/versions.js), no matter how many components on the screen want it.
//
// Security: this is the ONLY document the browser may read directly
// (firestore.rules). It holds counters only — the actual data still comes
// through the API routes with their role checks and field stripping.
//
// State: { versions: object|null, status: "connecting" | "live" | "failed" }
//   "failed" = the listener was refused or can't run (e.g. rules not yet
//   deployed, role missing) — useLiveRefresh then falls back to polling.

const TEARDOWN_DELAY_MS = 5000; // survive page-to-page navigation without reconnecting

let state = { versions: null, status: "connecting" };
const subscribers = new Set();
let unsubscribeSnapshot = null;
let starting = false;
let teardownTimer = null;

function emit(next) {
  state = next;
  subscribers.forEach((fn) => fn(state));
}

async function start() {
  if (unsubscribeSnapshot || starting) return;
  starting = true;
  try {
    // Loaded on demand so the Firestore SDK stays out of the first page load.
    // App Check first (when configured), so Firestore sends its token too.
    await require("./appCheckClient").ensureAppCheck();
    const { getFirestore, doc, onSnapshot } = await import("firebase/firestore");
    if (subscribers.size === 0) return; // everyone left while it loaded
    const db = getFirestore(app); // default = memory cache: nothing persisted on the device
    unsubscribeSnapshot = onSnapshot(
      doc(db, "meta", "versions"),
      (snap) => {
        // A cache-only snapshot (e.g. opened offline) isn't the real server
        // state — using it as a baseline would cause a spurious refetch
        // the moment the real one arrives.
        if (snap.metadata.fromCache) return;
        emit({ versions: snap.data() || {}, status: "live" });
      },
      () => {
        // Network drops are retried inside the SDK and never land here;
        // this is a hard refusal (permission-denied etc.) — stop and fall back.
        unsubscribeSnapshot = null;
        emit({ versions: state.versions, status: "failed" });
      }
    );
  } catch {
    emit({ versions: state.versions, status: "failed" });
  } finally {
    starting = false;
  }
}

function stop() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = null;
  state = { versions: null, status: "connecting" };
}

export function subscribeVersions(fn) {
  subscribers.add(fn);
  clearTimeout(teardownTimer);
  if (state.status === "failed") fn(state);
  else {
    if (state.versions) fn(state);
    start();
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      clearTimeout(teardownTimer);
      teardownTimer = setTimeout(stop, TEARDOWN_DELAY_MS);
    }
  };
}

// Called on sign-out so the listener never outlives the session.
export function stopLiveVersions() {
  clearTimeout(teardownTimer);
  subscribers.clear();
  stop();
}
