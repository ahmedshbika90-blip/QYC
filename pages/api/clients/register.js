const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");
const { isValidPhone, normalizePhone } = require("../../../lib/validation");
const { bumpVersion } = require("../../../lib/versions");
const { STORE_CLASSES } = require("../../../lib/labels");
const { isValidRequestId } = require("../../../lib/requestId");
const { cleanDeliveryRoute, DELIVERY_ROUTE_MAX } = require("../../../lib/clientFields");
const { reportServerError } = require("../../../lib/monitor");

const COUNTER_DOC = adminDb.collection("meta").doc("clientIdCounter");

// Assigns the next sequential 4-digit client ID ("1000", "1001", ...) and
// writes the client in ONE transaction, together with a record of the
// device's request ID. If a weak connection delivers the same registration
// twice, the second attempt finds its request ID already recorded and
// returns the client created the first time — no duplicate client, no
// wasted ID. Concurrent registrations can never get the same number.
async function registerOnce(requestId, clientDoc) {
  const requestRef = adminDb.collection("clientRequests").doc(requestId);
  return adminDb.runTransaction(async (tx) => {
    const [reqSnap, counterSnap] = await Promise.all([tx.get(requestRef), tx.get(COUNTER_DOC)]);
    if (reqSnap.exists) {
      const { clientId, createdBy } = reqSnap.data();
      if (createdBy !== clientDoc.createdBy) {
        const err = new Error("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
        err.statusCode = 409;
        throw err;
      }
      const existing = await tx.get(adminDb.collection("clients").doc(clientId));
      return { clientId, data: existing.data(), duplicate: true };
    }

    const current = counterSnap.exists ? counterSnap.data().value : 999; // first ID will be 1000
    const next = current + 1;
    if (next > 9999) {
      throw new Error("تم استنفاد أرقام العملاء (الحد الأقصى 9999)");
    }
    const clientId = String(next);

    tx.set(COUNTER_DOC, { value: next }, { merge: true });
    tx.set(adminDb.collection("clients").doc(clientId), clientDoc);
    tx.set(requestRef, { clientId, createdBy: clientDoc.createdBy, createdAt: clientDoc.createdAt });
    return { clientId, data: clientDoc, duplicate: false };
  });
}

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2", "manager"]);

    const { nameFirst, nameMiddle, nameLast, storeName, location, storeClass, requestId } = req.body || {};
    // Arabic-keyboard digits (٠١٢…) are accepted and stored as English digits.
    const phone = normalizePhone(req.body?.phone);
    const whatsapp = normalizePhone(req.body?.whatsapp);
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }
    let { route } = req.body || {};

    // An agent's own route isn't a choice — it's fixed by who they are
    // logged in as. The submitted route (if any) is ignored entirely for
    // agents so a tampered request can never register a client onto the
    // other agent's route. Only the supervisor actually picks a route.
    const forcedRoute = ROLE_TO_ROUTE[decoded.role];
    if (forcedRoute) {
      route = forcedRoute;
    }

    // Name must be entered as three separate parts (first/middle/last) —
    // no combined free-text name field anymore. All three, plus the rest
    // of the basic client data, are required before a client is created
    // at all: an incomplete submission is rejected with a clear reason
    // rather than silently registering a half-empty record.
    if (!nameFirst?.trim() || !nameMiddle?.trim() || !nameLast?.trim()) {
      return res.status(400).json({ error: "اسم العميل يجب إدخاله ثلاثيًا: الاسم الأول والأوسط والأخير" });
    }
    if (!storeName || !location || !route || !phone) {
      return res.status(400).json({
        error: "اسم المتجر والموقع والمسار ورقم الهاتف كلها مطلوبة",
      });
    }
    if (!["car1", "car2"].includes(route)) {
      return res.status(400).json({ error: 'المسار يجب أن يكون جملة أو تجزئة' });
    }
    const deliveryRoute = cleanDeliveryRoute(req.body?.deliveryRoute);
    if (!deliveryRoute) {
      return res.status(400).json({ error: "المسار مطلوب — اختره من القائمة أو أضف مسارًا جديدًا" });
    }
    if (deliveryRoute.length > DELIVERY_ROUTE_MAX) {
      return res.status(400).json({ error: `اسم المسار أطول من ${DELIVERY_ROUTE_MAX} حرفًا` });
    }
    if (!STORE_CLASSES.includes(storeClass)) {
      return res.status(400).json({ error: "تصنيف المتجر يجب أن يكون A أو B أو C" });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بصفر" });
    }
    if (whatsapp && !isValidPhone(whatsapp)) {
      return res.status(400).json({ error: "رقم الواتساب يجب أن يتكون من 10 أرقام ويبدأ بصفر" });
    }

    const clientDoc = {
      name: [nameFirst.trim(), nameMiddle.trim(), nameLast.trim()].join(" "),
      nameFirst: nameFirst.trim(),
      nameMiddle: nameMiddle.trim(),
      nameLast: nameLast.trim(),
      storeName,
      deliveryRoute,
      location,
      route,
      phone,
      whatsapp: whatsapp || phone, // defaults to the same number unless a separate one is given
      storeClass,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    };
    clientDoc.syncAt = clientDoc.createdAt; // devices download only clients changed since their copy (lib/clientsStore.js)

    const result = await registerOnce(requestId, clientDoc);
    if (!result.duplicate) await bumpVersion("clients");

    return res
      .status(result.duplicate ? 200 : 201)
      .json({ clientId: result.clientId, ...result.data, duplicate: result.duplicate });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
