const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

// Public on purpose — clients browse this catalog from /new-order with no login.
// Only active products are returned by default so discontinued items disappear
// from the ordering form without deleting their history from past orders.
// Passing ?all=1 also returns inactive products, but that view is staff-only.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const includeInactive = req.query.all === "1";
    if (includeInactive) {
      await requireUser(req); // staff-only view of the full catalog
    }

    let query = adminDb.collection("products").orderBy("name");
    if (!includeInactive) {
      query = query.where("active", "==", true);
    }
    const snap = await query.get();
    const products = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ products });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
