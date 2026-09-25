const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser } = require("../../../../lib/apiAuth");
const { isValidPhone } = require("../../../../lib/validation");

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
  if (!restrictedRoute && decoded.role !== "supervisor") {
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
      // Agents may still edit name/store/location/active on their own route.
      const { name, storeName, location, route, active, phone, whatsapp } = req.body || {};

      if (route !== undefined && route !== client.route && decoded.role !== "supervisor") {
        return res.status(403).json({ error: "المشرف فقط يمكنه تغيير مسار العميل" });
      }
      if (!checkAccess(decoded, client.route, res)) return;
      if (route !== undefined && !["car1", "car2"].includes(route)) {
        return res.status(400).json({ error: 'المسار يجب أن يكون السيارة ١ أو السيارة ٢' });
      }
      if (phone !== undefined && !isValidPhone(phone)) {
        return res.status(400).json({ error: "رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بصفر" });
      }
      if (whatsapp && !isValidPhone(whatsapp)) {
        return res.status(400).json({ error: "رقم الواتساب يجب أن يتكون من 10 أرقام ويبدأ بصفر" });
      }

      const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
      if (name !== undefined) updates.name = name;
      if (storeName !== undefined) updates.storeName = storeName;
      if (location !== undefined) updates.location = location;
      if (route !== undefined) updates.route = route;
      if (active !== undefined) updates.active = Boolean(active);
      if (phone !== undefined) updates.phone = phone;
      if (whatsapp !== undefined) updates.whatsapp = whatsapp || phone || client.phone;

      await ref.update(updates);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
