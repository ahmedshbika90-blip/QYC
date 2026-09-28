const ALREADY_EXISTS = 6; // gRPC status code Firestore uses for create() on an existing doc

/**
 * Creates a document ONLY if its ID doesn't exist yet. The ID is the
 * device-generated request ID, so a repeated submission (weak connection,
 * retry) returns { duplicate: true, data } for the original instead of
 * creating a second copy. `ownerField`/`ownerId` guard against an ID
 * collision with someone else's document.
 */
async function createOnce(docRef, data, { ownerField, ownerId } = {}) {
  try {
    await docRef.create(data);
    return { duplicate: false, data };
  } catch (err) {
    if (err.code !== ALREADY_EXISTS) throw err;
    const snap = await docRef.get();
    const existing = snap.data();
    if (ownerField && existing[ownerField] !== ownerId) {
      const conflict = new Error("تعارض في رقم الطلب، يرجى المحاولة مرة أخرى");
      conflict.statusCode = 409;
      throw conflict;
    }
    return { duplicate: true, data: existing };
  }
}

module.exports = { createOnce };
