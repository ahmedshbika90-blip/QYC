const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, sendError } = require("../../../lib/apiAuth");
const { cachedByVersions } = require("../../../lib/serverCache");
const { reportServerError } = require("../../../lib/monitor");

// English names entered by people, for the English interface: product names
// (manager, products page) and staff names (admin, accounts page).
//   GET /api/i18n/terms → { terms: { "<Arabic>": "<English>" } }
// Any signed-in staff member; it only reveals names they already see.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    if (!decoded.role) return res.status(403).json({ error: "غير مصرح" });
    // Cached per server instance until a product or a staff name changes (or 2 min).
    const terms = await cachedByVersions("i18nTerms", ["products", "profiles"], 120 * 1000, async () => {
      const [products, profiles] = await Promise.all([adminDb.collection("products").get(), adminDb.collection("profiles").get()]);
      const out = {};
      products.docs.forEach((d) => {
        const p = d.data();
        if (p.name && p.nameEn) out[p.name.trim().replace(/\s+/g, " ")] = p.nameEn;
      });
      profiles.docs.forEach((d) => {
        const p = d.data();
        if (p.nameAr && p.nameEn) out[p.nameAr.trim().replace(/\s+/g, " ")] = p.nameEn;
      });
      return Object.freeze(out);
    });
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({ terms });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
