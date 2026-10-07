const { requireUser, sendError } = require("../../../lib/apiAuth");
const { addEntry, listEntries, canView, canEnter, LIST_LIMIT } = require("../../../lib/competitors");
const { bumpVersions, getVersion } = require("../../../lib/versions");

// Competitor prices.
//   GET  → { entries, version, canEnter, limit }   executive, manager, sales supervisor
//   POST { company, item, sku, price, date, requestId } → sales supervisor only
export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    if (req.method === "GET") {
      if (!canView(decoded)) return res.status(403).json({ error: "Forbidden: insufficient role" });
      const [entries, version] = await Promise.all([listEntries(), getVersion("competitors")]);
      // Who typed what is shown to the people reading the report, not
      // needed in the uid form anywhere else.
      const out = entries.map(({ createdBy, ...e }) => ({ ...e, mine: createdBy === decoded.uid }));
      return res.status(200).json({ entries: out, version, canEnter: canEnter(decoded), limit: LIST_LIMIT });
    }
    if (req.method === "POST") {
      const result = await addEntry(decoded, req.body || {});
      if (!result.duplicate) await bumpVersions(["competitors"]);
      const { createdBy, ...entry } = result.entry;
      return res.status(result.duplicate ? 200 : 201).json({ duplicate: result.duplicate, entry: { ...entry, mine: true } });
    }
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  } catch (err) {
    return sendError(res, err);
  }
}
