// Stock adjustments (تسويات المخزون) — goods leaving stock other than by sale:
//
//   writeoff   تسوية تالف — the warehouse keeper picks goods from the
//              warehouse's damaged (تالف) balance; the MANAGER approves.
//                mode "transfer": the goods leave with no value (as if
//                                 they were never there)
//                mode "obsolete": their COST is deducted from the margin
//   freeSample عينات مجانية — the MANAGER asks for samples from the depot;
//              the WAREHOUSE KEEPER executes them (approves).
//                mode "supplier": the supplier pays → leaves with no value
//                mode "company":  the company pays → COST deducted from margin
//
// Cost = the product's average cost at the moment of approval. The margin
// deduction is dated on the approval day (decidedDay). Stock moves only on
// approval, in the same transaction (with the stock ledger).
//
//   stockAdjustments/{requestId}
//     { kind, mode, items: [{ productId, name, unit, qty, unitCost?, cost? }],
//       note, status: pending | approved | rejected,
//       requestedBy, requestedByRole, requestedAt,
//       decidedBy, decidedAt, decidedDay, decisionNote,
//       costTotal, marginDeduction }

const { adminDb } = require("./firebaseAdmin");
const { applyStockMovements } = require("./inventory");
const { isValidRequestId } = require("./requestId");
const { parseQty, isValidQty } = require("./qty");
const { businessDay } = require("./businessDay");

const COLL = "stockAdjustments";
const KINDS = {
  writeoff: { modes: ["transfer", "obsolete"], from: "damaged", requester: "warehouse_keeper", approver: "manager", costModes: ["obsolete"] },
  freeSample: { modes: ["supplier", "company"], from: "depot", requester: "manager", approver: "warehouse_keeper", costModes: ["company"] },
};
const round2 = (n) => Math.round(Number(n) * 100) / 100;
function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

async function requestAdjustment(decoded, body = {}) {
  const k = KINDS[body.kind];
  if (!k) throw bad("نوع غير صالح");
  if (decoded.role !== k.requester) throw bad(body.kind === "writeoff" ? "تسوية التالف يطلبها أمين المخزن" : "العينات المجانية يطلبها المدير", 403);
  if (!k.modes.includes(body.mode)) throw bad(body.kind === "writeoff" ? "اختر: مرتجع شركة أو غير صالحة" : "اختر: على المورد أو على الشركة");
  if (!isValidRequestId(body.requestId)) throw bad("طلب غير صالح، يرجى تحديث الصفحة والمحاولة مرة أخرى");
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) throw bad("اختر الأصناف وكمياتها");
  const merged = {};
  for (const it of raw) {
    if (!it || typeof it.productId !== "string" || !isValidQty(it.qty)) throw bad("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر (بدون كسور)");
    merged[it.productId] = (merged[it.productId] || 0) + parseQty(it.qty);
  }
  const ids = Object.keys(merged);
  const snaps = await adminDb.getAll(...ids.map((id) => adminDb.collection("products").doc(id)));
  const short = [];
  const items = ids.map((id, i) => {
    if (!snaps[i].exists) throw bad("أحد المنتجات غير موجود");
    const p = snaps[i].data();
    const have = Number(p.stock?.[k.from]) || 0;
    if (merged[id] > have) short.push(`${p.name}: المتاح ${have}`);
    return { productId: id, name: p.name, unit: p.unit || "", qty: merged[id] };
  });
  if (short.length) throw bad(`${k.from === "damaged" ? "رصيد التالف" : "رصيد المخزن"} لا يكفي — ${short.join("، ")}`, 409);
  const ref = adminDb.collection(COLL).doc(body.requestId);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  return adminDb.runTransaction(async (tx) => {
    const ex = await tx.get(ref);
    if (ex.exists) return { duplicate: true, id: ref.id };
    const doc = { kind: body.kind, mode: body.mode, items, note, status: "pending", requestedBy: decoded.uid, requestedByName: decoded.name || decoded.email || null, requestedByRole: decoded.role, requestedAt: new Date().toISOString() };
    tx.create(ref, doc);
    return { duplicate: false, id: ref.id, adjustment: doc };
  });
}

async function decideAdjustment(decoded, id, body = {}, now = new Date()) {
  const ref = adminDb.collection(COLL).doc(String(id || ""));
  const approve = body.action === "approve";
  if (!approve && body.action !== "reject") throw bad("إجراء غير معروف");
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw bad("الطلب غير موجود", 404);
    const a = snap.data();
    const k = KINDS[a.kind];
    if (decoded.role !== k.approver) throw bad(a.kind === "writeoff" ? "يعتمدها المدير" : "ينفذها أمين المخزن", 403);
    if (a.status !== "pending") return { duplicate: true, status: a.status };
    const stamp = now.toISOString();
    const decision = { decidedBy: decoded.uid, decidedByName: decoded.name || decoded.email || null, decidedAt: stamp, decidedDay: businessDay(now), decisionNote: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "" };
    if (!approve) {
      tx.update(ref, { status: "rejected", ...decision });
      return { status: "rejected" };
    }
    const prods = await Promise.all(a.items.map((it) => tx.get(adminDb.collection("products").doc(it.productId))));
    // checks the balance again and moves it, with the stock ledger
    await applyStockMovements(tx, a.items.map((it) => ({ productId: it.productId, field: k.from, delta: -it.qty })));
    const items = a.items.map((it, i) => {
      const unitCost = typeof prods[i].data()?.avgCost === "number" ? prods[i].data().avgCost : 0;
      return { ...it, unitCost, cost: round2(unitCost * it.qty) };
    });
    const costTotal = round2(items.reduce((s, it) => s + it.cost, 0));
    const marginDeduction = k.costModes.includes(a.mode) ? costTotal : 0;
    tx.update(ref, { status: "approved", items, costTotal, marginDeduction, ...decision });
    return { status: "approved", costTotal, marginDeduction };
  });
}

/** Requests, newest first (filters in memory — a small collection). */
async function listAdjustments({ kind, status, from, to } = {}) {
  const snap = await adminDb.collection(COLL).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => (!kind || a.kind === kind) && (!status || a.status === status))
    .filter((a) => (!from || String(a.requestedAt).slice(0, 10) >= from || (a.decidedDay && a.decidedDay >= from)) && (!to || String(a.requestedAt).slice(0, 10) <= to))
    .sort((x, y) => String(y.requestedAt).localeCompare(String(x.requestedAt)));
}

/**
 * Margin deductions approved between two business days (dated by approval):
 * obsolete damaged goods and company-paid free samples, at cost.
 */
async function marginDeductions(fromDay, toDay) {
  const snap = await adminDb.collection(COLL).where("decidedDay", ">=", fromDay).where("decidedDay", "<=", toDay).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status === "approved" && a.marginDeduction > 0);
  const by = { writeoff: 0, freeSample: 0 };
  rows.forEach((a) => (by[a.kind] = round2((by[a.kind] || 0) + a.marginDeduction)));
  return {
    total: round2(rows.reduce((s, a) => s + a.marginDeduction, 0)),
    obsolete: by.writeoff || 0,
    freeSamples: by.freeSample || 0,
    items: rows.map((a) => ({ id: a.id, kind: a.kind, mode: a.mode, day: a.decidedDay, amount: a.marginDeduction, items: a.items.map((i) => `${i.name} × ${i.qty}`).join("، ") })),
  };
}

module.exports = { requestAdjustment, decideAdjustment, listAdjustments, marginDeductions, ADJ_KINDS: KINDS, STOCK_ADJ: COLL };
