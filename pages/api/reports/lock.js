const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");
const { fetchReportOrders } = require("../../../lib/reportQuery");
const { isValidRequestId } = require("../../../lib/requestId");

const BATCH_LIMIT = 400; // Firestore allows 500 writes per batch

// Called when a sales report is shared: locks every invoice in it, so any
// later change needs supervisor approval — the report that went out stays
// true. Uses the SAME invoice selection as the report itself. Records the
// shared report (who, when, which period) as an audit trail. Only writes
// to invoices not already locked. Safe to repeat (request ID).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    const { from, to, route, requestId } = req.body || {};
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى" });
    }

    const recordRef = adminDb.collection("sentReports").doc(requestId);
    const existing = await recordRef.get();
    if (existing.exists) {
      return res.status(200).json({ locked: existing.data().newlyLocked, duplicate: true });
    }

    const { route: reportRoute, orders } = await fetchReportOrders(decoded, { route, from, to });
    const toLock = orders.filter((o) => !o.lockedAt && o.status !== "cancelled");
    const now = new Date().toISOString();

    for (let i = 0; i < toLock.length; i += BATCH_LIMIT) {
      const batch = adminDb.batch();
      toLock.slice(i, i + BATCH_LIMIT).forEach((o) =>
        batch.update(o.ref, { lockedAt: now, lockedByReport: requestId })
      );
      await batch.commit();
    }

    await recordRef.set({
      sentBy: decoded.uid,
      sentByRole: decoded.role,
      sentAt: now,
      route: reportRoute,
      from: from || null,
      to: to || null,
      invoiceCount: orders.filter((o) => o.status !== "cancelled").length,
      newlyLocked: toLock.length,
    });

    return res.status(200).json({ locked: toLock.length });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
