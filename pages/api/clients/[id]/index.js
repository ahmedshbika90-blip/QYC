const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { bumpVersion } = require("../../../../lib/versions");
const { buildClientUpdates } = require("../../../../lib/clientFields");
const { isClientEditLocked, CLIENT_EDIT_WINDOW_HOURS } = require("../../../../lib/clientEditLock");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

function checkAccess(decoded, clientRoute, res) {
  const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
  if (restrictedRoute && clientRoute !== restrictedRoute) {
    res.status(403).json({ error: "غير مصرح: هذا خارج مسارك" });
    return false;
  }
  if (!restrictedRoute && decoded.role !== "manager") {
    res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    const { id } = req.query;

    const ref = adminDb.collection("clients").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "العميل غير موجود" });
    }
    const client = snap.data();

    if (req.method === "GET") {
      if (!checkAccess(decoded, client.route, res)) return;
      return res.status(200).json({ id: snap.id, ...client });
    }

    if (req.method === "PATCH") {
      // Reassigning route: only a supervisor may move a client between
      // routes, since it changes which agent's queue the client belongs to.
      const { route } = req.body || {};
      if (route !== undefined && route !== client.route && decoded.role !== "manager") {
        return res.status(403).json({ error: "المدير فقط يمكنه تغيير مسار العميل" });
      }
      if (!checkAccess(decoded, client.route, res)) return;
      if (route !== undefined && !["car1", "car2"].includes(route)) {
        return res.status(400).json({ error: "المسار يجب أن يكون جملة أو تجزئة" });
      }

      // 12-hour window (lib/clientEditLock.js): after it, an agent's edit
      // has to go through the supervisor as a request instead.
      if (decoded.role !== "manager" && isClientEditLocked(client)) {
        return res.status(423).json({
          error: `مرّ أكثر من ${CLIENT_EDIT_WINDOW_HOURS} ساعة على تسجيل هذا العميل — التعديل يحتاج موافقة المدير`,
          code: "CLIENT_LOCKED",
        });
      }
      if (client.pendingRequest && decoded.role !== "manager") {
        return res.status(409).json({ error: "يوجد طلب تعديل لهذا العميل بانتظار المدير" });
      }

      const updates = {
        ...buildClientUpdates(req.body, client),
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid,
      };
      updates.syncAt = updates.updatedAt; // delta sync (lib/clientsStore.js)
      if (route !== undefined) updates.route = route;
      // Lets the old route's devices drop this client on their next delta sync.
      if (route !== undefined && route !== client.route) updates.movedFrom = client.route;

      await ref.update(updates);
      await bumpVersion("clients");
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
