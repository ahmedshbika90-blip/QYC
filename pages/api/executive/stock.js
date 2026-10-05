const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { buildStock, receivedHistory } = require("../../../lib/executiveSummary");

// Executive (and manager) — tab 3 of /executive. Quantities only.
//   GET                                  → { products } current balances
//   GET ?view=received&from&to&cursor    → { docs, nextCursor } goods received
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["executive", "manager"]);
    const { view, from, to, cursor } = req.query;
    if (view === "received") return res.status(200).json(await receivedHistory({ from, to, cursor }));
    return res.status(200).json(await buildStock());
  } catch (err) {
    return sendError(res, err);
  }
}
