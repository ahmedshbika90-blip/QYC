const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../lib/apiAuth");

// Transfers for the supervisor (who creates them) and the warehouse keeper
// (who releases them). Newest first; ?status=pending narrows it to the
// keeper's queue. Quantities only — there is nothing price-related here.
// Agents have no access.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["supervisor", "warehouse_keeper"]);
    const snap = await adminDb.collection("transfers").orderBy("createdAt", "desc").limit(200).get();
    let transfers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (req.query.status) transfers = transfers.filter((t) => t.status === req.query.status);
    return res.status(200).json({ transfers });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
