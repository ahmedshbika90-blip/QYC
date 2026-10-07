// Invoice payments — recorded, seen and voided by the ACCOUNTANT ONLY.
//
// Storage (deliberately NOT on the invoice document, so no existing invoice
// endpoint can ever leak them to another role):
//   invoicePayments/{orderId}  { orderId, payments: [...], paidTotal, count, updatedAt }
//   paymentRefs/{bank}__{ref}  { orderId, paymentId, createdAt }
//
// paymentRefs makes a bank reference usable once: the same transfer can't be
// recorded twice, on the same invoice or another. Voiding a payment frees
// its reference again.
//
// A payment = { id, ref, bank, amount, date, note?, createdAt, createdBy,
//               createdByEmail, voided?, voidedAt?, voidedBy?, voidReason? }
// Voided payments are kept (audit trail) but never counted.

const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");
const { parseDecimal } = require("./qty");
const { isValidRequestId } = require("./requestId");

const { BANKS, BANK_IDS, BANK_LABELS } = require("./paymentsShared");

const REF_RE = /^\d{1,11}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PER_INVOICE = 50;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function bad(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

const toEnglishDigits = (v) =>
  String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** Digits only, 1–11 of them. Arabic digits are accepted and converted. */
function cleanRef(v) {
  const s = toEnglishDigits(v).trim();
  if (!REF_RE.test(s)) throw bad("رقم العملية يجب أن يكون أرقامًا فقط، من 1 إلى 11 رقمًا");
  return s;
}

function cleanBank(v) {
  if (!BANK_IDS.includes(v)) throw bad("اختر البنك من القائمة");
  return v;
}

function cleanAmount(v) {
  const n = parseDecimal(v);
  if (!Number.isFinite(n) || n <= 0) throw bad("المبلغ يجب أن يكون رقمًا أكبر من صفر");
  if (round2(n) !== n) throw bad("المبلغ يقبل منزلتين عشريتين فقط");
  if (n > 1e12) throw bad("المبلغ كبير جدًا");
  return n;
}

function cleanDate(v, now = new Date()) {
  const s = toEnglishDigits(v).trim();
  if (!YMD.test(s) || isNaN(new Date(`${s}T00:00:00Z`))) throw bad("تاريخ الدفعة غير صالح");
  if (s > businessDay(now)) throw bad("تاريخ الدفعة لا يمكن أن يكون في المستقبل");
  if (s < "2000-01-01") throw bad("تاريخ الدفعة غير صالح");
  return s;
}

function cleanNote(v) {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw bad("الملاحظة غير صالحة");
  const s = v.trim();
  if (s.length > 200) throw bad("الملاحظة أطول من 200 حرف");
  return s || null;
}

const refKey = (bank, ref) => `${bank}__${ref}`;
// Stored on every paymentRefs doc so a PART of a reference can be searched.
// Bank references share their leading digits (branch / date prefixes) but
// their last four almost never repeat, so the accountant searches by those:
//   last4   equality lookup — the main search (one indexed query)
//   refRev  digits reversed, for "ends with" on 5+ typed digits
//   ref     the full reference
// All single-field, served by Firestore's automatic indexes.
const last4Of = (ref) => String(ref).slice(-4);
const refFields = (bank, ref) => ({ bank, ref, refRev: [...ref].reverse().join(""), last4: last4Of(ref) });
// Copied onto the reference doc so a search can show the result (amount,
// date, client) without first opening the payment.
const refSummary = (payment, order) => ({
  amount: payment.amount,
  date: payment.date,
  clientId: order?.clientId ? String(order.clientId) : null,
  route: order?.route || null,
});
const activePayments = (list) => (list || []).filter((p) => !p.voided);
const sumPaid = (list) => round2(activePayments(list).reduce((s, p) => s + Number(p.amount || 0), 0));

/** "unpaid" | "partial" | "paid" | "over" for an invoice total and amount paid. */
function paymentStatus(total, paid) {
  const t = round2(Number(total) || 0);
  const p = round2(Number(paid) || 0);
  if (p <= 0) return "unpaid";
  if (p < t) return "partial";
  if (p === t) return "paid";
  return "over"; // only after the invoice itself was reduced later
}

function summarize(order, doc) {
  const total = round2(Number(order?.total) || 0);
  const paid = doc ? Number(doc.paidTotal) || 0 : 0;
  return {
    total,
    paid: round2(paid),
    remaining: round2(Math.max(0, total - paid)),
    count: doc ? Number(doc.count) || 0 : 0,
    status: order?.status === "cancelled" ? (paid > 0 ? "cancelledPaid" : "cancelled") : paymentStatus(total, paid),
  };
}

/**
 * Records one payment. `id` is the device's request ID, so a retried
 * submission (weak connection) is recognised and not recorded twice.
 */
async function addPayment(actor, orderId, body, now = new Date()) {
  if (typeof orderId !== "string" || !orderId || orderId.length > 200) throw bad("الفاتورة غير صالحة");
  const id = isValidRequestId(body.requestId) ? body.requestId : null;
  if (!id) throw bad("رقم الطلب غير صالح");
  const payment = {
    id,
    ref: cleanRef(body.ref),
    bank: cleanBank(body.bank),
    amount: cleanAmount(body.amount),
    date: cleanDate(body.date, now),
    note: cleanNote(body.note),
  };

  // Same last 4 digits as a payment already recorded (any bank, any
  // invoice)? Most likely the same transfer typed again — stop and let the
  // accountant compare before it's saved. `confirmSimilar` = "I checked,
  // save it anyway". A resend of this very payment never warns about itself.
  if (!body.confirmSimilar) {
    const [similar, saved] = await Promise.all([
      findSimilarRefs(payment.ref, { bank: payment.bank, excludePaymentId: id }),
      adminDb.collection("invoicePayments").doc(orderId).get(),
    ]);
    const alreadySaved = saved.exists && (saved.data().payments || []).some((p) => p.id === id);
    if (similar.length && !alreadySaved) return { needsConfirm: true, similar };
  }

  const orderRef = adminDb.collection("orders").doc(orderId);
  const payRef = adminDb.collection("invoicePayments").doc(orderId);
  const keyRef = adminDb.collection("paymentRefs").doc(refKey(payment.bank, payment.ref));

  return adminDb.runTransaction(async (tx) => {
    const [orderSnap, paySnap, keySnap] = await Promise.all([tx.get(orderRef), tx.get(payRef), tx.get(keyRef)]);
    if (!orderSnap.exists) throw bad("الفاتورة غير موجودة", 404);
    const order = orderSnap.data();
    const existing = paySnap.exists ? paySnap.data() : null;
    const list = existing?.payments || [];

    const dup = list.find((p) => p.id === id);
    if (dup) return { duplicate: true, payment: dup, summary: summarize(order, existing) };

    if (order.status === "cancelled") throw bad("لا يمكن تسجيل دفعة على فاتورة ملغاة");
    if (keySnap.exists) {
      const used = keySnap.data();
      throw bad(
        used.orderId === orderId
          ? "رقم العملية هذا مسجّل على هذه الفاتورة بالفعل"
          : "رقم العملية هذا لنفس البنك مسجّل على فاتورة أخرى",
        409
      );
    }
    if (list.length >= MAX_PER_INVOICE) throw bad("تم بلوغ الحد الأقصى للدفعات على هذه الفاتورة");

    const total = round2(Number(order.total) || 0);
    const paid = sumPaid(list);
    if (round2(paid + payment.amount) > total) {
      throw bad(`المبلغ أكبر من المتبقي على الفاتورة (${round2(total - paid)})`);
    }

    const full = { ...payment, createdAt: now.toISOString(), createdBy: actor.uid, createdByEmail: actor.email || null };
    const payments = [...list, full];
    const doc = {
      orderId,
      route: order.route || null,
      clientId: order.clientId || null,
      payments,
      paidTotal: sumPaid(payments),
      count: activePayments(payments).length,
      updatedAt: now.toISOString(),
    };
    tx.set(payRef, doc);
    tx.set(keyRef, { orderId, paymentId: id, createdAt: full.createdAt, ...refFields(payment.bank, payment.ref), ...refSummary(full, order) });
    return { duplicate: false, payment: full, summary: summarize(order, doc) };
  });
}

/**
 * Edits a payment (bank, reference, amount, date, note). The previous values
 * are kept in the payment's `edits` list. Same rules as adding: digits-only
 * reference used once per bank, total paid never above the invoice total.
 */
async function editPayment(actor, orderId, body, now = new Date()) {
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const next = {
    ref: cleanRef(body.ref),
    bank: cleanBank(body.bank),
    amount: cleanAmount(body.amount),
    date: cleanDate(body.date, now),
    note: cleanNote(body.note),
  };
  const orderRef = adminDb.collection("orders").doc(orderId);
  const payRef = adminDb.collection("invoicePayments").doc(orderId);
  const newKeyRef = adminDb.collection("paymentRefs").doc(refKey(next.bank, next.ref));

  // A NEW reference number gets the same last-4 check as a new payment.
  if (!body.confirmSimilar) {
    const current = await payRef.get();
    const before = current.exists ? (current.data().payments || []).find((p) => p.id === paymentId) : null;
    if (before && before.ref !== next.ref) {
      const similar = await findSimilarRefs(next.ref, { bank: next.bank, excludePaymentId: paymentId });
      if (similar.length) return { needsConfirm: true, similar };
    }
  }

  return adminDb.runTransaction(async (tx) => {
    const [orderSnap, paySnap, keySnap] = await Promise.all([tx.get(orderRef), tx.get(payRef), tx.get(newKeyRef)]);
    if (!orderSnap.exists) throw bad("الفاتورة غير موجودة", 404);
    if (!paySnap.exists) throw bad("الدفعة غير موجودة", 404);
    const order = orderSnap.data();
    const data = paySnap.data();
    const target = (data.payments || []).find((p) => p.id === paymentId);
    if (!target) throw bad("الدفعة غير موجودة", 404);
    if (target.voided) throw bad("لا يمكن تعديل دفعة ملغاة");

    const unchanged = ["ref", "bank", "amount", "date", "note"].every((k) => (target[k] ?? null) === (next[k] ?? null));
    if (unchanged) return { duplicate: true, payment: target, summary: summarize(order, data) };

    const keyChanged = target.bank !== next.bank || target.ref !== next.ref;
    if (keyChanged && keySnap.exists) {
      throw bad(keySnap.data().orderId === orderId ? "رقم العملية هذا مسجّل على هذه الفاتورة بالفعل" : "رقم العملية هذا لنفس البنك مسجّل على فاتورة أخرى", 409);
    }
    const total = round2(Number(order.total) || 0);
    const others = sumPaid(data.payments.filter((p) => p.id !== paymentId));
    if (round2(others + next.amount) > total) throw bad(`المبلغ أكبر من المتبقي على الفاتورة (${round2(total - others)})`);

    const before = { ref: target.ref, bank: target.bank, amount: target.amount, date: target.date, note: target.note ?? null };
    const updated = {
      ...target,
      ...next,
      editedAt: now.toISOString(),
      editedBy: actor.uid,
      edits: [...(target.edits || []), { at: now.toISOString(), by: actor.uid, before }],
    };
    const payments = data.payments.map((p) => (p.id === paymentId ? updated : p));
    const doc = { ...data, payments, paidTotal: sumPaid(payments), count: activePayments(payments).length, updatedAt: now.toISOString() };
    tx.set(payRef, doc);
    if (keyChanged) {
      tx.delete(adminDb.collection("paymentRefs").doc(refKey(target.bank, target.ref)));
      tx.set(newKeyRef, { orderId, paymentId, createdAt: now.toISOString(), ...refFields(next.bank, next.ref), ...refSummary(updated, order) });
    } else {
      // Same reference: keep the copied amount/date on it current.
      tx.set(newKeyRef, { orderId, paymentId, ...refFields(next.bank, next.ref), ...refSummary(updated, order) }, { merge: true });
    }
    return { duplicate: false, payment: updated, summary: summarize(order, doc) };
  });
}

const LAST4 = 4; // digits the accountant types to search
const SEARCH_LIMIT = 20;
const SIMILAR_LIMIT = 10;

// Reference docs saved before the last-4 search existed lack `last4` (and
// the oldest also `ref`/`refRev`); add them once, in batches, and remember
// it. The flag is also kept in memory, so after the first search a server
// instance never re-reads it.
const SEARCH_FLAG = "paymentRefsSearch2";
let searchReady = false;
async function ensureRefFields() {
  if (searchReady) return;
  const flag = adminDb.collection("meta").doc(SEARCH_FLAG);
  if ((await flag.get()).exists) {
    searchReady = true;
    return;
  }
  const snap = await adminDb.collection("paymentRefs").get();
  const docs = snap.docs.filter((d) => d.data().last4 === undefined);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = adminDb.batch();
    docs.slice(i, i + 400).forEach((d) => {
      const [bank, ref] = d.id.split("__");
      batch.set(d.ref, { ...d.data(), ...refFields(bank, ref) });
    });
    await batch.commit();
  }
  await flag.set({ doneAt: new Date().toISOString(), updated: docs.length });
  searchReady = true;
}

const hitOf = (d) => {
  const data = d.data();
  const [bank, ref] = d.id.split("__");
  return { ...data, bank: data.bank || bank, ref: data.ref || ref };
};

/**
 * Payments found by the digits the accountant typed, across all banks:
 *   exactly 4 digits  → every reference ENDING in them (the normal search)
 *   5–11 digits       → the exact reference, plus references ending in them
 *   1–3 digits        → the exact reference only (very short references)
 * Exact matches first, then newest. All queries run in parallel.
 */
async function findByRef(input) {
  const q = cleanRef(input);
  const coll = adminDb.collection("paymentRefs");
  const out = new Map();
  const add = (d) => out.set(d.id, hitOf(d));

  const exactP = adminDb.getAll(...BANK_IDS.map((b) => coll.doc(refKey(b, q))));
  let partialP = Promise.resolve(null);
  if (q.length >= LAST4) {
    await ensureRefFields();
    partialP =
      q.length === LAST4
        ? coll.where("last4", "==", q).limit(SEARCH_LIMIT).get()
        : (() => {
            const rev = [...q].reverse().join("");
            return coll.where("refRev", ">=", rev).where("refRev", "<=", rev + "\uf8ff").limit(SEARCH_LIMIT).get();
          })();
  }
  const [exact, partial] = await Promise.all([exactP, partialP]);
  exact.filter((s) => s.exists).forEach(add);
  if (partial) partial.docs.forEach(add);

  return [...out.values()]
    .sort((a, b) => (a.ref === q ? 0 : 1) - (b.ref === q ? 0 : 1) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, SEARCH_LIMIT);
}

/**
 * Recorded payments whose reference has the same last 4 digits as `ref`
 * (any bank). Used to warn before saving what may be the same transfer.
 */
async function findSimilarRefs(ref, { bank, excludePaymentId } = {}) {
  if (String(ref).length < LAST4) return [];
  await ensureRefFields();
  const snap = await adminDb.collection("paymentRefs").where("last4", "==", last4Of(ref)).limit(SIMILAR_LIMIT + 2).get();
  // The very same bank + reference isn't a "maybe": it's refused outright
  // by the save itself, so it isn't offered for approval here.
  const hits = snap.docs.map(hitOf).filter((h) => h.paymentId !== excludePaymentId && !(h.bank === bank && h.ref === ref));
  if (!hits.length) return [];
  return describeRefs(hits.slice(0, SIMILAR_LIMIT));
}

/**
 * Turns reference hits into rows for the screen: invoice, client name,
 * amount, date, payment status. One parallel batch of reads (invoices,
 * their payment docs and clients together); only references saved before
 * client ids were copied onto them need a second step for the client.
 */
async function describeRefs(hits, typed) {
  if (!hits.length) return [];
  const ids = [...new Set(hits.map((h) => h.orderId))];
  const knownClients = [...new Set(hits.map((h) => h.clientId).filter(Boolean).map(String))];
  const clientRef = (id) => adminDb.collection("clients").doc(String(id));
  const [orderSnaps, payDocs, clientSnaps] = await Promise.all([
    adminDb.getAll(...ids.map((id) => adminDb.collection("orders").doc(id))),
    paymentDocsFor(ids),
    knownClients.length ? adminDb.getAll(...knownClients.map(clientRef)) : [],
  ]);
  const orders = {};
  orderSnaps.forEach((s) => s.exists && (orders[s.id] = s.data()));
  const names = {};
  clientSnaps.forEach((s) => s.exists && (names[s.id] = s.data().name || ""));
  const missing = [...new Set(Object.values(orders).map((o) => o.clientId && String(o.clientId)).filter((id) => id && !(id in names)))];
  if (missing.length) (await adminDb.getAll(...missing.map(clientRef))).forEach((s) => s.exists && (names[s.id] = s.data().name || ""));

  return hits
    .filter((h) => orders[h.orderId])
    .map((h) => {
      const o = orders[h.orderId];
      const p = (payDocs[h.orderId]?.payments || []).find((x) => x.id === h.paymentId);
      return {
        orderId: h.orderId,
        paymentId: h.paymentId,
        bank: h.bank,
        bankLabel: BANK_LABELS[h.bank] || h.bank,
        ref: h.ref,
        exact: typed != null && h.ref === typed,
        amount: p?.amount ?? h.amount ?? null,
        date: p?.date ?? h.date ?? null,
        clientName: names[String(o.clientId)] || null,
        clientId: o.clientId || null,
        createdAt: o.createdAt,
        route: o.route,
        payment: summarize(o, payDocs[h.orderId]),
      };
    });
}

/** Voids (never deletes) a payment and frees its bank reference. */
async function voidPayment(actor, orderId, body, now = new Date()) {
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const reason = cleanNote(body.reason);
  if (!reason) throw bad("اكتب سبب الإلغاء");

  const orderRef = adminDb.collection("orders").doc(orderId);
  const payRef = adminDb.collection("invoicePayments").doc(orderId);

  return adminDb.runTransaction(async (tx) => {
    const [orderSnap, paySnap] = await Promise.all([tx.get(orderRef), tx.get(payRef)]);
    if (!paySnap.exists) throw bad("الدفعة غير موجودة", 404);
    const data = paySnap.data();
    const target = (data.payments || []).find((p) => p.id === paymentId);
    if (!target) throw bad("الدفعة غير موجودة", 404);
    if (target.voided) return { duplicate: true, summary: summarize(orderSnap.data(), data) };

    const payments = data.payments.map((p) =>
      p.id === paymentId ? { ...p, voided: true, voidedAt: now.toISOString(), voidedBy: actor.uid, voidReason: reason } : p
    );
    const doc = { ...data, payments, paidTotal: sumPaid(payments), count: activePayments(payments).length, updatedAt: now.toISOString() };
    tx.set(payRef, doc);
    tx.delete(adminDb.collection("paymentRefs").doc(refKey(target.bank, target.ref)));
    return { duplicate: false, summary: summarize(orderSnap.exists ? orderSnap.data() : null, doc) };
  });
}

/**
 * What every role that can see an invoice may see about its payments: the
 * amount paid and what's left. Bank names, references and dates stay with
 * the accountant.
 */
function publicPayment(order, doc) {
  const s = summarize(order, doc);
  return { paid: s.paid, remaining: s.remaining, status: s.status };
}

/** Payment docs for many invoices at once (1 read each, batched). */
async function paymentDocsFor(orderIds) {
  const out = {};
  const ids = [...new Set(orderIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => adminDb.collection("invoicePayments").doc(id));
    if (!refs.length) continue;
    const snaps = await adminDb.getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) out[s.id] = s.data();
    });
  }
  return out;
}

module.exports = {
  BANKS,
  BANK_IDS,
  BANK_LABELS,
  cleanRef,
  cleanAmount,
  cleanDate,
  paymentStatus,
  summarize,
  addPayment,
  voidPayment,
  paymentDocsFor,
  publicPayment,
  editPayment,
  findByRef,
  findSimilarRefs,
  describeRefs,
};
