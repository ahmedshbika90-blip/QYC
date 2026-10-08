// Legal invoice numbers: INV-2026-000123 — sequential and gap-free per
// calendar year (Khartoum), given inside the transaction that creates the
// invoice, so two invoices can never get the same number and a failed save
// never "uses up" one. A cancelled invoice keeps its number (it still
// exists, marked cancelled), so the sequence has no holes.
//
//   meta/invoiceNumbering            { enabled: true } — switched on by
//                                    scripts/invoices/number-existing.js
//                                    after it has numbered every older invoice
//   meta/invoiceCounter_{year}       { value: last number used that year }
//
// Until numbering is enabled, invoices are saved without a number (shown by
// their short code, as before).

const { adminDb } = require("./firebaseAdmin");
const { businessDay } = require("./businessDay");

const PAD = 6;
const formatNumber = (year, seq) => `INV-${year}-${String(seq).padStart(PAD, "0")}`;
const yearOf = (createdAt) => businessDay(new Date(createdAt)).slice(0, 4);
const counterRef = (year) => adminDb.collection("meta").doc(`invoiceCounter_${year}`);
const flagRef = () => adminDb.collection("meta").doc("invoiceNumbering");

/**
 * Inside the invoice transaction, BEFORE any write: reserves the next number.
 * Returns null when numbering isn't enabled yet; otherwise
 * { number, numberYear, numberSeq, commit() } — call commit() with the writes.
 */
async function prepareInvoiceNumber(tx, createdAt) {
  const year = yearOf(createdAt);
  const [flag, counter] = await Promise.all([tx.get(flagRef()), tx.get(counterRef(year))]);
  if (!flag.exists || !flag.data().enabled) return null;
  const seq = (counter.exists ? Number(counter.data().value) || 0 : 0) + 1;
  return {
    number: formatNumber(year, seq),
    numberYear: Number(year),
    numberSeq: seq,
    commit: () => tx.set(counterRef(year), { value: seq, updatedAt: new Date().toISOString() }, { merge: true }),
  };
}

/**
 * One-time: numbers every invoice saved before numbering existed, oldest
 * first, per year — then switches numbering on for new invoices, in a
 * transaction that first checks no un-numbered invoice slipped in.
 * Without `write`: only reports what it would do.
 */
async function numberExisting({ write = false, onProgress } = {}) {
  const orders = adminDb.collection("orders");
  const flag = await flagRef().get();
  if (flag.exists && flag.data().enabled) return { alreadyEnabled: true, numbered: 0, byYear: {} };
  const byYear = {};
  let numbered = 0;
  let lastAt = "";
  for (let pass = 0; pass < 20; pass++) {
    const snap = await (lastAt ? orders.where("createdAt", ">=", lastAt) : orders).orderBy("createdAt", "asc").get();
    const todo = snap.docs.filter((d) => !d.data().number && d.data().createdAt);
    if (!todo.length) break;
    if (!write) {
      todo.forEach((d) => {
        const y = yearOf(d.data().createdAt);
        byYear[y] = (byYear[y] || 0) + 1;
      });
      return { alreadyEnabled: false, numbered: todo.length, byYear, dryRun: true };
    }
    for (let i = 0; i < todo.length; i += 150) {
      const chunk = todo.slice(i, i + 150);
      await adminDb.runTransaction(async (tx) => {
        const years = [...new Set(chunk.map((d) => yearOf(d.data().createdAt)))];
        const counters = Object.fromEntries(await Promise.all(years.map(async (y) => [y, await tx.get(counterRef(y))])));
        const fresh = await Promise.all(chunk.map((d) => tx.get(d.ref)));
        const next = Object.fromEntries(years.map((y) => [y, counters[y].exists ? Number(counters[y].data().value) || 0 : 0]));
        fresh.forEach((snapDoc) => {
          if (!snapDoc.exists || snapDoc.data().number) return;
          const y = yearOf(snapDoc.data().createdAt);
          next[y] += 1;
          tx.update(snapDoc.ref, { number: formatNumber(y, next[y]), numberYear: Number(y), numberSeq: next[y] });
          byYear[y] = (byYear[y] || 0) + 1;
          numbered += 1;
        });
        years.forEach((y) => tx.set(counterRef(y), { value: next[y], updatedAt: new Date().toISOString() }, { merge: true }));
      });
      if (onProgress) onProgress(numbered);
    }
    lastAt = todo[todo.length - 1].data().createdAt;
  }
  if (write) {
    // Switch on only if nothing new and un-numbered appeared meanwhile.
    await adminDb.runTransaction(async (tx) => {
      const tail = await tx.get(lastAt ? orders.where("createdAt", ">=", lastAt) : orders);
      if (tail.docs.some((d) => !d.data().number && d.data().createdAt)) {
        const e = new Error("new invoices arrived while numbering — run the script again");
        e.retry = true;
        throw e;
      }
      tx.set(flagRef(), { enabled: true, at: new Date().toISOString() });
    });
  }
  return { alreadyEnabled: false, numbered, byYear, dryRun: !write };
}

module.exports = { numberExisting, prepareInvoiceNumber, formatNumber, yearOf, counterRef, flagRef, PAD };
