const { requireUser, sendError } = require("../../lib/apiAuth");
const { addPlaces, listPlaces } = require("../../lib/places");
const { bumpVersions, getVersion } = require("../../lib/versions");
const { reportServerError } = require("../../lib/monitor");

// Routes (المسار) and locations (الموقع) added without a client.
//   GET  → { routes, locations, version }       sales staff (own type), manager (both)
//   POST { route?, location?, salesRoute? }      salesRoute only for the manager
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    if (req.method === "GET") {
      const [data, version] = await Promise.all([listPlaces(decoded), getVersion("places")]);
      return res.status(200).json({ ...data, version });
    }
    if (req.method === "POST") {
      const result = await addPlaces(decoded, req.body || {});
      if (result.added.length) await bumpVersions(["places"]);
      return res.status(result.added.length ? 201 : 200).json(result);
    }
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    reportServerError(err, req, res);
    return sendError(res, err);
  }
}
