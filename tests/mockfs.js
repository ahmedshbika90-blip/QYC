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
  function docRef(c, id) {
    const ref = {
      id, path: `${c}/${id}`, _c: c,
      async get() { const d = col(c)[id]; return { id, exists: !!d, ref, data: () => clone(d) }; },
      _set(v, opts) { if (opts && opts.merge && col(c)[id]) applyUpdate(col(c)[id], v); else { col(c)[id] = {}; applyUpdate(col(c)[id], v); } },
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
      where: (f, op, v) => query(c, [...filters, [f, op, v]], order, lim, after),
      orderBy: (f, dir = "asc") => query(c, filters, [f, dir], lim, after),
      limit: (n) => query(c, filters, order, n, after),
      startAfter: (v) => query(c, filters, order, lim, v),
      doc: (id) => docRef(c, id || `auto${++autoId}`),
      async add(v) { const r = docRef(c, `auto${++autoId}`); r._set(v); return r; },
      count: () => ({ async get() { const r = await query(c, filters, order, lim, after).get(); return { data: () => ({ count: r.size }) }; } }),
      async get() {
        let rows = Object.entries(col(c)).map(([id, d]) => ({ id, d }));
        const val = (d, f) => f.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
        for (const [f, op, v] of filters) {
          rows = rows.filter(({ d }) => {
            const x = val(d, f);
            if (op === "==") return x === v;
            if (x == null) return false;
            if (op === ">=") return x >= v;
            if (op === "<=") return x <= v;
            throw new Error("op " + op);
          });
        }
        if (order) {
          const [f, dir] = order;
          rows.sort((a, b) => (val(a.d, f) < val(b.d, f) ? -1 : 1) * (dir === "desc" ? -1 : 1));
          if (after != null) rows = rows.filter(({ d }) => (dir === "desc" ? val(d, f) < after : val(d, f) > after));
        }
        if (lim) rows = rows.slice(0, lim);
        const docs = rows.map(({ id, d }) => ({ id, exists: true, ref: docRef(c, id), data: () => clone(d) }));
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  }
  const db = {
    _data: data,
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
