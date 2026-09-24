const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor"]);

    const { name, price, unit, category } = req.body || {};

    if (!name || price === undefined || price === null || !unit) {
      return res.status(400).json({ error: "name, price, and unit are required" });
    }
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: "price must be a non-negative number" });
    }

    const productDoc = {
      name,
      price: numericPrice,
      unit,
      category: category || null,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    };

    const ref = await adminDb.collection("products").add(productDoc);
    return res.status(201).json({ id: ref.id, ...productDoc });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
