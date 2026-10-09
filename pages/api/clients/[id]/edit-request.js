const { adminDb } = require("../../../../lib/firebaseAdmin");
const { requireUser, requireRole } = require("../../../../lib/apiAuth");
const { isValidRequestId } = require("../../../../lib/requestId");
const { bumpVersions } = require("../../../../lib/versions");
const { buildClientUpdates, changedFields, snapshot } = require("../../../../lib/clientFields");
const { isClientEditLocked } = require("../../../../lib/clientEditLock");
const { reportServerError } = require("../../../../lib/monitor");

const ROLE_TO_ROUTE = { agent_car1: "car1", agent_car2: "car2" };
const MAX_REASON = 500;

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  throw err;
}

// An agent asks the supervisor to change a client's details once the
// 12-hour self-edit window has closed (lib/clientEditLock.js). Nothing on
// the client changes until the supervisor approves — this stores the
// details as they are now and as the agent wants them, so the supervisor
// compares side by side. One pending request per client at a time.
//
// It lives in the same `changeRequests` collection as invoice edit/cancel
// requests (type "client_edit"), so it appears in the supervisor's
// existing الطلبات queue, notifications and nav dot with no new plumbing.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);
    requireRole(decoded, ["agent_car1", "agent_car2"]);

    const { id } = req.query;
    const { reason, requestId, ...fields } = req.body || {};
    if (!isValidRequestId(requestId)) fail(400, "طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى");
    if (typeof reason !== "string" || !reason.trim()) fail(400, "اكتب سبب التعديل للمدير");
    if (reason.length > MAX_REASON) fail(400, `السبب يجب ألا يتجاوز ${MAX_REASON} حرف`);
    if (fields.route !== undefined) delete fields.route; // route changes are supervisor-only, never requested

    const clientRef = adminDb.collection("clients").doc(id);
    const requestRef = adminDb.collection("changeRequests").doc(requestId);

    const already = await requestRef.get();
    if (already.exists) {
      if (already.data().requestedBy !== decoded.uid) fail(409, "تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
      return res.status(200).json({ id: requestId, duplicate: true });
    }

    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) fail(404, "العميل غير موجود");
    const client = clientSnap.data();
    if (client.route !== decoded.route) fail(403, "غير مصرح: هذا خارج مسارك");
    if (!isClientEditLocked(client)) fail(400, "ما زال بإمكانك تعديل هذا العميل مباشرة");

    const proposed = changedFields(buildClientUpdates(fields, client), client);
    if (Object.keys(proposed).length === 0) fail(400, "لم تغيّر أي بيانات");

    const now = new Date().toISOString();
    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(clientRef);
      if (fresh.data().pendingRequest) fail(409, "يوجد طلب تعديل لهذا العميل بانتظار المدير بالفعل");
      tx.set(requestRef, {
        type: "client_edit",
        orderId: null,
        route: client.route,
        clientId: id,
        clientName: client.name,
        reason: reason.trim(),
        currentClient: snapshot(fresh.data()),
        proposedClient: proposed,
        status: "pending",
        requestedBy: decoded.uid,
        requestedAt: now,
        decidedBy: null,
        decidedAt: null,
        decisionNote: "",
        seenByRequester: false,
      });
      tx.update(clientRef, { pendingRequest: { id: requestId, type: "client_edit", requestedAt: now }, syncAt: now });
    });

    await bumpVersions(["requests", "clients"]);
    return res.status(201).json({ id: requestId });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
