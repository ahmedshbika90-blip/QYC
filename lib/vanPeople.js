// Who works on each van: the sales accounts assigned to it (van claim, or
// the original van of their sales type), supervisors first. Read from the
// accounts, cached until an account or a van changes.

const { adminAuth } = require("./firebaseAdmin");
const { cachedByVersions } = require("./serverCache");
const { salesFlags, normalizeRole } = require("./roles");

async function peopleByVan() {
  return cachedByVersions("vanPeople", ["profiles", "vans"], 5 * 60 * 1000, async () => {
    const out = {};
    if (typeof adminAuth.listUsers !== "function") return out;
    let token;
    do {
      const page = await adminAuth.listUsers(1000, token);
      page.users.forEach((u) => {
        if (u.disabled) return;
        const claims = u.customClaims || {};
        const role = normalizeRole(claims.role);
        const f = salesFlags({ ...claims, role });
        if (!f.route) return;
        (out[f.route] = out[f.route] || []).push({ uid: u.uid, name: u.displayName || u.email || u.uid, supervisor: f.salesSupervisor });
      });
      token = page.pageToken;
    } while (token);
    for (const list of Object.values(out)) list.sort((a, b) => (b.supervisor ? 1 : 0) - (a.supervisor ? 1 : 0) || a.name.localeCompare(b.name, "ar"));
    return out;
  });
}

module.exports = { peopleByVan };
