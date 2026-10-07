const { requireUser, requireRole, sendError } = require("../../../lib/apiAuth");
const { findByRef, describeRefs, cleanRef } = require("../../../lib/payments");

// Accountant: invoices with a payment whose transaction reference (رقم
// العملية) ends with the typed digits — normally the LAST 4, which (unlike
// the first digits) almost never repeat between transfers. 5+ digits also
// match the exact reference; under 4 digits, the exact reference only.
// One indexed query, then one parallel batch of reads for the rows.
//   GET /api/accounting/find-ref?ref=4417
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["accountant"]);
    res.setHeader("Cache-Control", "no-store");
    const typed = cleanRef(req.query.ref);
    const hits = await findByRef(typed);
    return res.status(200).json({ matches: await describeRefs(hits, typed) });
  } catch (err) {
    return sendError(res, err);
  }
}
