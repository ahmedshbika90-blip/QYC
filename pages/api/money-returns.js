const { requireUser, requireRole, sendError } = require("../../lib/apiAuth");
const { returnCandidates, requestReturn, decideReturn, listReturns } = require("../../lib/moneyReturns");
const { bumpVersions } = require("../../lib/versions");
const { reportServerError } = require("../../lib/monitor");

// Money returns (رد مبلغ).
//   Agent:      GET ?candidates=1        → his invoices holding credit
//               GET                      → his requests
//               POST { orderIds, requestId, note? }
//   Accountant: GET ?status=pending      → requests
//               POST { id, action: "approve", method: "bank"|"cash", bank?, ref?, date, note? }
//               POST { id, action: "reject", note? }
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    const isAgent = decoded.role === "agent_car1" || decoded.role === "agent_car2";
    if (!isAgent) requireRole(decoded, ["accountant"]);
    if (req.method === "GET") {
      if (isAgent && req.query.candidates) return res.status(200).json({ invoices: await returnCandidates(decoded) });
      const all = await listReturns({ status: req.query.status ? String(req.query.status) : undefined });
      const route = decoded.role === "agent_car1" ? "car1" : decoded.role === "agent_car2" ? "car2" : null;
      return res.status(200).json({ requests: route ? all.filter((r) => r.route === route) : all });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
    const body = req.body || {};
    const result = isAgent ? await requestReturn(decoded, body) : await decideReturn(decoded, body.id, body);
    if (!result.duplicate) await bumpVersions(["payments", "requests"]);
    return res.status(isAgent && !result.duplicate ? 201 : 200).json(result);
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
