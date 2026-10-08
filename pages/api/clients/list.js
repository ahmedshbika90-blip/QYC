const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");
const { getVersion } = require("../../../lib/versions");
const { reportServerError } = require("../../../lib/monitor");

const SYNC_OVERLAP_MS = 2 * 60 * 1000;

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Pass ?v=<version the browser already has>. If nothing has changed since,
// this costs exactly 1 Firestore read and returns { unchanged: true } —
// the browser keeps using its stored copy. Only when a client was actually
// added/edited does it read and return the full list.
//
// Searching and filtering (name, location, class) happen in the browser on
// the stored copy — Firestore can't do substring search anyway, and doing
// it locally costs zero reads.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    // The executive gets the full customer database, read-only (no client
    // write endpoint accepts that role).
    if (!restrictedRoute && !["manager", "executive"].includes(decoded.role)) {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    const version = await getVersion("clients");
    if (req.query.v && req.query.v === version) {
      return res.status(200).json({ unchanged: true, version });
    }

    // Delta: the device sends the time of its last copy (?since=), and gets
    // only the clients written since then — every client write stamps
    // `syncAt`. Overlaps a couple of minutes so a write that committed just
    // after a slightly later one is never skipped (repeats are harmless:
    // the device replaces by id). A client moved off an agent's route comes
    // back in `removed`. One read per changed client, not the whole list.
    const startedAt = new Date().toISOString();
    const since = String(req.query.since || "");
    if (since && !isNaN(Date.parse(since))) {
      const from = new Date(Date.parse(since) - SYNC_OVERLAP_MS).toISOString();
      const snap = await adminDb.collection("clients").where("syncAt", ">=", from).get();
      const changed = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({
        delta: true,
        version,
        syncAt: startedAt,
        clients: changed.filter((c) => !restrictedRoute || c.route === restrictedRoute),
        removed: restrictedRoute ? changed.filter((c) => c.route !== restrictedRoute && c.movedFrom === restrictedRoute).map((c) => c.id) : [],
      });
    }

    // Equality-only filter, sorted in memory — avoids needing a composite
    // index on (route, createdAt) for a list that's small and fully loaded.
    let query = adminDb.collection("clients");
    if (restrictedRoute) query = query.where("route", "==", restrictedRoute);

    const snap = await query.get();
    const clients = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return res.status(200).json({ clients, version, syncAt: startedAt });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
