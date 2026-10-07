// Minimal in-memory Firestore for testing the real API handlers.
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const FV = {
  delete: () => ({ __op: "delete" }),
  increment: (n) => ({ __op: "inc", n }),
  arrayUnion: (...items) => ({ __op: "union", items }),
};
let autoId = 0;
function makeDb() {
  const data = {}; // path -> object
  const stats = { reads: 0, byColl: {} }; // billed reads, for the cost report (tests/run13.js)
  const col = (name) => (data[name] = data[name] || {});
  function applyUpdate(obj, upd) {
    for (const [k, v] of Object.entries(upd)) {
      const parts = k.split(".");
      let o = obj;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
      const last = parts[parts.length - 1];
      if (v && v.__op === "delete") delete o[last];
      else if (v && v.__op === "inc") o[last] = (o[last] || 0) + v.n;
      else if (v && v.__op === "union") o[last] = [...(o[last] || []), ...clone(v.items)];
      else o[last] = clone(v);
    }
  }
  // set(..., { merge: true }) merges nested maps field by field, like
  // Firestore does (and applies increments at any depth).
  function deepMerge(target, src) {
    for (const [k, v] of Object.entries(src)) {
      if (v && v.__op === "delete") delete target[k];
      else if (v && v.__op === "inc") target[k] = (typeof target[k] === "number" ? target[k] : 0) + v.n;
      else if (v && v.__op === "union") target[k] = [...(target[k] || []), ...clone(v.items)];
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) target[k] = {};
        deepMerge(target[k], v);
      } else target[k] = clone(v);
    }
  }
  function docRef(c, id) {
    const ref = {
      id, path: `${c}/${id}`, _c: c,
      async get() { stats.reads += 1; stats.byColl[c] = (stats.byColl[c] || 0) + 1; const d = col(c)[id]; return { id, exists: !!d, ref, data: () => clone(d) }; },
      _set(v, opts) { if (opts && opts.merge && col(c)[id]) deepMerge(col(c)[id], v); else if (opts && opts.merge) { col(c)[id] = {}; deepMerge(col(c)[id], v); } else { col(c)[id] = {}; applyUpdate(col(c)[id], v); } },
      _update(v) { if (!col(c)[id]) throw new Error("NOT_FOUND " + c + "/" + id); applyUpdate(col(c)[id], v); },
      _create(v) { if (col(c)[id]) { const e = new Error("exists"); e.code = 6; throw e; } col(c)[id] = {}; applyUpdate(col(c)[id], v); },
      async set(v, o) { ref._set(v, o); },
      async update(v) { ref._update(v); },
      async create(v) { ref._create(v); },
      async delete() { delete col(c)[id]; },
    };
    return ref;
  }
  function query(c, filters = [], order = null, lim = null, after = null) {
    return {
      _name: c,
      where: (f, op, v) => query(c, [...filters, [f, op, v]], order, lim, after),
      orderBy: (f, dir = "asc") => query(c, filters, [f, dir], lim, after),
      limit: (n) => query(c, filters, order, n, after),
      startAfter: (v) => query(c, filters, order, lim, v),
      doc: (id) => docRef(c, id || `auto${++autoId}`),
      async add(v) { const r = docRef(c, `auto${++autoId}`); r._set(v); return r; },
      count: () => ({ async get() { const r = await query(c, filters, order, lim, after).get(); const refund = Math.max(1, r.size) - Math.max(1, Math.ceil(r.size / 1000)); stats.reads -= refund; stats.byColl[c] -= refund; return { data: () => ({ count: r.size }) }; } }), // aggregation: 1 read per 1,000 matches
      async get() {
        let rows = Object.entries(col(c)).map(([id, d]) => ({ id, d }));
        const val = (d, f) => f.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
        for (const [f, op, v] of filters) {
          rows = rows.filter(({ d }) => {
            const x = val(d, f);
            if (op === "==") return x === v;
            if (op === "in") return v.includes(x);
            if (x == null) return false;
            if (op === ">=") return x >= v;
            if (op === "<=") return x <= v;
            if (op === ">") return x > v;
            if (op === "<") return x < v;
            throw new Error("op " + op);
          });
        }
        if (order) {
          const [f, dir] = order;
          rows = rows.filter(({ d }) => val(d, f) != null); // like Firestore: docs without the field are left out
          rows.sort((a, b) => (val(a.d, f) < val(b.d, f) ? -1 : 1) * (dir === "desc" ? -1 : 1));
          if (after != null) rows = rows.filter(({ d }) => (dir === "desc" ? val(d, f) < after : val(d, f) > after));
        }
        if (lim) rows = rows.slice(0, lim);
        // Firestore bills one read per document returned, minimum one per query.
        stats.reads += Math.max(1, rows.length); stats.byColl[c] = (stats.byColl[c] || 0) + Math.max(1, rows.length);
        const docs = rows.map(({ id, d }) => ({ id, exists: true, ref: docRef(c, id), data: () => clone(d) }));
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  }
  const db = {
    _data: data,
    _stats: stats,
    _resetReads() { stats.reads = 0; stats.byColl = {}; },
    collection: (c) => query(c),
    async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
    batch() { const ops = []; return { update: (r, v) => ops.push(() => r.update(v)), set: (r, v) => ops.push(() => r.set(v)), async commit() { for (const o of ops) await o(); } }; },
    async runTransaction(fn) {
      // Enforce Firestore's rule: all reads must happen before any write.
      let wrote = false;
      const tx = {
        async get(r) { if (wrote) throw new Error("TX VIOLATION: read after write on " + r.path); return r.get(); },
        set(r, v, o) { wrote = true; r._set(v, o); },
        update(r, v) { wrote = true; r._update(v); },
        create(r, v) { wrote = true; r._create(v); },
        delete(r) { wrote = true; delete col(r._c)[r.id]; },
      };
      return fn(tx);
    },
  };
  return db;
}
module.exports = { makeDb, FV };
