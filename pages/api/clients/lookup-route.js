const { adminDb } = require("../../../lib/firebaseAdmin");
const { checkRateLimit, getClientIp } = require("../../../lib/rateLimit");

// Public on purpose (same reasoning as /api/orders/create) — /new-order
// needs to know a client's route BEFORE showing the catalog, since each
// product has a different price per route. Only the route is returned,
// nothing else about the client.
//
// Rate-limited by IP: this is the exact endpoint someone would hammer to
// enumerate which of the 10,000 possible 4-digit codes are real client
// IDs. A genuine customer only ever calls this once or twice.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const ip = getClientIp(req);
    const ok = await checkRateLimit(`lookup_ip_${ip}`, { maxRequests: 20, windowMs: 60 * 1000 });
    if (!ok) {
      return res.status(429).json({ error: "عدد كبير من المحاولات، يرجى المحاولة لاحقًا" });
    }

    const { clientId } = req.query;
    if (!clientId || !/^\d{4}$/.test(clientId)) {
      return res.status(400).json({ error: "رقم العميل يجب أن يتكون من 4 أرقام" });
    }

    const snap = await adminDb.collection("clients").doc(clientId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "لا يوجد عميل بهذا الرقم" });
    }
    const client = snap.data();
    if (client.active === false) {
      return res.status(403).json({ error: "هذا الحساب غير مُفعّل، يرجى التواصل مع المندوب" });
    }

    return res.status(200).json({ route: client.route });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
