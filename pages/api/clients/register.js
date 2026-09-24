const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");

const COUNTER_DOC = adminDb.collection("meta").doc("clientIdCounter");

// Generates the next sequential 4-digit client ID, e.g. "1000", "1001", ...
// Uses a transaction so concurrent registrations never collide.
async function getNextClientId() {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(COUNTER_DOC);
    const current = snap.exists ? snap.data().value : 999; // first ID will be 1000
    const next = current + 1;

    if (next > 9999) {
      throw new Error("Client ID space exhausted (4 digits max, 9999 reached)");
    }

    tx.set(COUNTER_DOC, { value: next }, { merge: true });
    return String(next);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2", "supervisor"]);

    const { name, storeName, location, route, phone, whatsapp } = req.body || {};

    if (!name || !storeName || !location || !route || !phone) {
      return res.status(400).json({
        error: "الاسم والمتجر والموقع والمسار ورقم الهاتف كلها مطلوبة",
      });
    }
    if (!["car1", "car2"].includes(route)) {
      return res.status(400).json({ error: 'المسار يجب أن يكون السيارة ١ أو السيارة ٢' });
    }

    const clientId = await getNextClientId();

    const clientDoc = {
      name,
      storeName,
      location,
      route,
      phone,
      whatsapp: whatsapp || phone, // defaults to the same number unless a separate one is given
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    };

    await adminDb.collection("clients").doc(clientId).set(clientDoc);

    return res.status(201).json({ clientId, ...clientDoc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
