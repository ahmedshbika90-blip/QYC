const { adminDb } = require("../../lib/firebaseAdmin");
const { requireUser, sendError } = require("../../lib/apiAuth");
const { reportServerError } = require("../../lib/monitor");

// The signed-in person's own profile picture (used on the executive's
// dashboard). Stored as a small JPEG/PNG/WebP data URL — the browser resizes
// it to 256 px before upload (≈ 20 KB), so no file storage service is needed.
//   GET    /api/profile        → { photo | null, nameAr, nameEn }
//   PUT    /api/profile        { photo: "data:image/jpeg;base64,..." }
//   DELETE /api/profile        removes the picture
const MAX_BYTES = 150 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    if (!decoded.role) return res.status(403).json({ error: "غير مصرح" });
    res.setHeader("Cache-Control", "no-store");
    const ref = adminDb.collection("profiles").doc(decoded.uid);

    if (req.method === "GET") {
      const snap = await ref.get();
      const d = snap.exists ? snap.data() : {};
      return res.status(200).json({ photo: d.photo || null, nameAr: d.nameAr || "", nameEn: d.nameEn || "" });
    }
    if (req.method === "PUT") {
      const photo = req.body?.photo;
      if (typeof photo !== "string" || !DATA_URL.test(photo)) return res.status(400).json({ error: "الصورة غير صالحة" });
      if (photo.length > MAX_BYTES) return res.status(400).json({ error: "الصورة كبيرة جدًا" });
      await ref.set({ photo, updatedAt: new Date().toISOString() }, { merge: true });
      return res.status(200).json({ photo });
    }
    if (req.method === "DELETE") {
      await ref.set({ photo: null, updatedAt: new Date().toISOString() }, { merge: true });
      return res.status(200).json({ photo: null });
    }
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
