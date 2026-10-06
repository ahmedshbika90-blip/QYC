const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, sendError } = require("../../../lib/apiAuth");

// English names entered by people, for the English interface: product names
// (manager, products page) and staff names (admin, accounts page).
//   GET /api/i18n/terms → { terms: { "<Arabic>": "<English>" } }
// Any signed-in staff member; it only reveals names they already see.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    if (!decoded.role) return res.status(403).json({ error: "غير مصرح" });
    const [products, profiles] = await Promise.all([
      adminDb.collection("products").get(),
      adminDb.collection("profiles").get(),
    ]);
    const terms = {};
    products.docs.forEach((d) => {
      const p = d.data();
      if (p.name && p.nameEn) terms[p.name.trim().replace(/\s+/g, " ")] = p.nameEn;
    });
    profiles.docs.forEach((d) => {
      const p = d.data();
      if (p.nameAr && p.nameEn) terms[p.nameAr.trim().replace(/\s+/g, " ")] = p.nameEn;
    });
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({ terms });
  } catch (err) {
    return sendError(res, err);
  }
}
