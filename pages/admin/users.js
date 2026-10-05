import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import SuccessToast from "../../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { ROLE_DEFS, ROLE_LABELS } from "../../lib/roles";
import { formatDateTime } from "../../lib/labels";

// The admin's only screen: every staff account, who holds which role, and
// the controls to change it. All changes go through /api/admin/users, which
// re-validates everything and ends the affected person's open sessions.

const field = "h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink";

async function send(token, url, method, body) {
  const res = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

function RoleBadge({ role }) {
  if (!role) return <span className="h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center bg-amber-100 text-amber-700">بدون صلاحية</span>;
  const tone = role === "admin" ? "bg-gray-800 text-white" : "bg-accent-soft text-accent-ink";
  return <span className={`h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center ${tone}`}>{ROLE_LABELS[role] || role}</span>;
}

function NewAccount({ token, onCreated, onCancel }) {
  const [form, setForm] = useState({ displayName: "", email: "", password: "", role: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await send(token, "/api/admin/users", "POST", { ...form, role: form.role || null });
      onCreated(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl shadow p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">حساب جديد</h2>
        <button type="button" onClick={onCancel} className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2" aria-label="إغلاق">
          <Icon name="x" />
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          الاسم
          <input value={form.displayName} onChange={set("displayName")} maxLength={60} className={field} placeholder="مثال: يونس أحمد" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          البريد الإلكتروني
          <input type="email" required dir="ltr" value={form.email} onChange={set("email")} className={field} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          كلمة المرور المؤقتة
          <input type="text" required minLength={8} dir="ltr" value={form.password} onChange={set("password")} className={field} autoComplete="new-password" />
          <span className="text-xs text-muted font-normal">8 أحرف على الأقل — سلّمها للموظف ليغيّرها لاحقًا.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          الصلاحية
          <select value={form.role} onChange={set("role")} className={field}>
            <option value="">بدون صلاحية (لا يستطيع الدخول)</option>
            {ROLE_DEFS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </div>
      <button disabled={busy} className="h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy && <Spinner className="w-4 h-4" />}
        إنشاء الحساب
      </button>
    </form>
  );
}

function AccountRow({ u, me, token, onSaved, onError }) {
  const [role, setRole] = useState(u.role || "");
  const [busy, setBusy] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const isMe = u.uid === me;
  useEffect(() => setRole(u.role || ""), [u.role]);

  async function patch(kind, body, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(kind);
    try {
      const { user } = await send(token, `/api/admin/users/${encodeURIComponent(u.uid)}`, "PATCH", body);
      onSaved(user, kind);
      if (kind === "password") {
        setPw("");
        setPwOpen(false);
      }
    } catch (err) {
      onError(err.message);
      setRole(u.role || "");
    } finally {
      setBusy("");
    }
  }

  const roleChanged = (role || null) !== (u.role || null) || Boolean(u.legacyRole);
  const def = ROLE_DEFS.find((r) => r.id === role);

  return (
    <li className={`p-4 sm:p-5 flex flex-col gap-3 ${u.disabled ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink flex flex-wrap items-center gap-2">
            {u.displayName || u.email}
            {isMe && <span className="text-xs text-muted font-normal">(أنت)</span>}
            {u.disabled && <span className="h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center bg-red-100 text-red-700">موقوف</span>}
          </p>
          {u.displayName && <p className="text-sm text-muted mt-0.5" dir="ltr" style={{ textAlign: "start" }}>{u.email}</p>}
          <p className="text-xs text-muted mt-1">آخر دخول: {u.lastSignIn ? formatDateTime(u.lastSignIn) : "لم يدخل بعد"}</p>
        </div>
        <RoleBadge role={u.role} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[220px] flex flex-col gap-1 text-xs font-semibold text-muted">
          الصلاحية
          <select value={role} disabled={isMe || !!busy} onChange={(e) => setRole(e.target.value)} className={field}>
            <option value="">بدون صلاحية</option>
            {ROLE_DEFS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        {roleChanged && !isMe && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => patch("role", { role: role || null }, u.legacyRole && role === u.role ? null : `تغيير صلاحية ${u.displayName || u.email} إلى «${role ? ROLE_LABELS[role] : "بدون صلاحية"}»؟ سيُسجَّل خروجه من كل أجهزته.`)}
            className="h-11 px-4 rounded-xl bg-accent text-on-accent font-semibold text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {busy === "role" && <Spinner className="w-4 h-4" />}
            حفظ الصلاحية
          </button>
        )}
      </div>
      {def && <p className="text-xs text-muted -mt-1">{def.hint}</p>}
      {u.legacyRole && <p className="text-xs text-amber-700">مسجّل بالاسم القديم «المشرف» — اضغط «حفظ الصلاحية» لتحديثه إلى «المدير».</p>}

      {!isMe && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => patch("disabled", { disabled: !u.disabled }, u.disabled ? null : `إيقاف حساب ${u.displayName || u.email}؟ لن يستطيع الدخول حتى تعيد تفعيله.`)}
            className={`h-10 px-3.5 rounded-xl text-sm font-semibold border flex items-center gap-2 ${u.disabled ? "border-accent text-accent-ink" : "border-red-200 text-red-700"}`}
          >
            {busy === "disabled" && <Spinner className="w-4 h-4" />}
            <Icon name={u.disabled ? "check" : "lock"} size={16} />
            {u.disabled ? "إعادة التفعيل" : "إيقاف الحساب"}
          </button>
          <button type="button" onClick={() => setPwOpen((v) => !v)} className="h-10 px-3.5 rounded-xl text-sm font-semibold border border-line text-ink-soft flex items-center gap-2">
            <Icon name="pencil" size={16} />
            كلمة مرور جديدة
          </button>
        </div>
      )}
      {pwOpen && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            patch("password", { password: pw }, `تعيين كلمة مرور جديدة لـ ${u.displayName || u.email}؟ سيُسجَّل خروجه من كل أجهزته.`);
          }}
        >
          <input type="text" dir="ltr" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8 أحرف على الأقل" className={`${field} flex-1 min-w-[200px]`} autoComplete="new-password" />
          <button disabled={!!busy} className="h-11 px-4 rounded-xl bg-gray-800 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
            {busy === "password" && <Spinner className="w-4 h-4" />}
            تعيين
          </button>
        </form>
      )}
    </li>
  );
}

function AuditList({ token }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch("/api/admin/audit", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setEntries(d.entries);
      })
      .catch((e) => setError(e.message));
  }, [token]);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!entries) return <SkeletonRows count={3} />;
  if (!entries.length) return <p className="text-sm text-muted">لا توجد تغييرات مسجلة بعد.</p>;
  const describe = (e) => {
    const d = e.details || {};
    if (e.action === "create") return `إنشاء حساب ${d.email || ""}${d.role ? ` بصلاحية «${ROLE_LABELS[d.role] || d.role}»` : ""}`;
    const parts = [];
    if (d.role) parts.push(`الصلاحية: ${d.role.from ? ROLE_LABELS[d.role.from] || d.role.from : "بدون"} ← ${d.role.to ? ROLE_LABELS[d.role.to] || d.role.to : "بدون"}`);
    if (d.disabled === true) parts.push("إيقاف الحساب");
    if (d.disabled === false) parts.push("إعادة التفعيل");
    if (d.password) parts.push("كلمة مرور جديدة");
    if (d.displayName !== undefined) parts.push("تعديل الاسم");
    return parts.join(" · ");
  };
  return (
    <ul className="bg-white rounded-2xl shadow divide-y divide-line">
      {entries.map((e) => (
        <li key={e.id} className="px-4 py-3 text-sm">
          <p className="text-ink">{describe(e)}</p>
          <p className="text-xs text-muted mt-0.5">{formatDateTime(e.at)} · <span dir="ltr">{e.byEmail}</span></p>
        </li>
      ))}
    </ul>
  );
}

export default function AdminUsers() {
  const { user, role, token, loading, logout } = useAuth(["admin"]);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAudit, setShowAudit] = useState(false);

  async function load() {
    setError("");
    try {
      const res = await apiFetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تحميل الحسابات");
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const counts = useMemo(() => {
    const c = { all: 0, none: 0 };
    (users || []).forEach((u) => {
      c.all += 1;
      const k = u.role || "none";
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [users]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (roleFilter !== "all" && (u.role || "none") !== roleFilter) return false;
      return !s || u.email.toLowerCase().includes(s) || u.displayName.toLowerCase().includes(s);
    });
  }, [users, q, roleFilter]);

  function saved(u, kind) {
    setUsers((list) => list.map((x) => (x.uid === u.uid ? u : x)));
    setToast(kind === "password" ? "تم تعيين كلمة المرور" : kind === "disabled" ? (u.disabled ? "تم إيقاف الحساب" : "تم تفعيل الحساب") : "تم حفظ الصلاحية");
  }

  if (loading) return <PageLoading />;

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      {toast && <SuccessToast message={toast} onDone={() => setToast("")} />}
      <main className="max-w-4xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-ink">الحسابات والصلاحيات</h1>
            <p className="text-sm text-muted mt-1">كل تغيير في الصلاحية أو إيقاف أو كلمة مرور يُخرج صاحب الحساب من أجهزته فورًا، ويُسجَّل في سجل التغييرات.</p>
          </div>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="h-11 px-4 rounded-xl bg-accent text-on-accent font-semibold flex items-center gap-2">
              <Icon name="userPlus" size={18} />
              حساب جديد
            </button>
          )}
        </header>

        {adding && (
          <NewAccount
            token={token}
            onCancel={() => setAdding(false)}
            onCreated={(u) => {
              setUsers((list) => [u, ...(list || [])]);
              setAdding(false);
              setToast("تم إنشاء الحساب");
            }}
          />
        )}

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span>{error}</span>
            <button type="button" onClick={() => { setError(""); load(); }} className="underline font-semibold shrink-0">إعادة المحاولة</button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو البريد..." className={`${field} ps-10`} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="تصفية حسب الصلاحية">
            {[["all", "الكل"], ...ROLE_DEFS.map((r) => [r.id, r.label]), ["none", "بدون صلاحية"]]
              .filter(([id]) => id === "all" || counts[id])
              .map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={roleFilter === id}
                  onClick={() => setRoleFilter(id)}
                  className={`h-9 px-3 rounded-full text-sm whitespace-nowrap border flex items-center gap-1.5 ${roleFilter === id ? "bg-accent text-on-accent border-accent font-semibold" : "bg-white text-ink-soft border-line"}`}
                >
                  {label}
                  <span className="num text-xs opacity-80">{counts[id] || 0}</span>
                </button>
              ))}
          </div>
        </div>

        {!users ? (
          error ? null : <SkeletonRows count={5} />
        ) : shown.length === 0 ? (
          <p className="text-muted">لا توجد حسابات مطابقة.</p>
        ) : (
          <ul className="bg-white rounded-2xl shadow divide-y divide-line">
            {shown.map((u) => (
              <AccountRow key={u.uid} u={u} me={user?.uid} token={token} onSaved={saved} onError={(m) => setError(m)} />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-3">
          <button type="button" onClick={() => setShowAudit((v) => !v)} className="self-start flex items-center gap-2 text-sm font-semibold text-ink-soft" aria-expanded={showAudit}>
            <Icon name={showAudit ? "chevronDown" : "chevronLeft"} size={18} />
            سجل التغييرات
          </button>
          {showAudit && <AuditList token={token} />}
        </section>
      </main>
    </div>
  );
}
