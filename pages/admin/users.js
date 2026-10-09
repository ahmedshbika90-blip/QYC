import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import SuccessToast from "../../components/SuccessToast";
import { PageLoading, SkeletonRows, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { ROLE_DEFS, ROLE_LABELS, SALES_ROUTES } from "../../lib/roles";
import PasswordInput from "../../components/PasswordInput";
import { formatDateTime } from "../../lib/labels";
import { useVans } from "../../lib/useVans";

const TYPE_OF_ROUTE = { car1: "wholesale", car2: "retail" };

// Van (and, for an agent, his supervisor) of a sales account.
function Assignment({ route, job, van, supervisorUid, vans, supervisors, onChange, disabled }) {
  const type = TYPE_OF_ROUTE[route];
  if (!type) return null;
  const choices = vans.filter((v) => v.type === type && (v.active !== false || v.id === van));
  const def = type === "wholesale" ? "car1" : "car2";
  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
        العربة
        <select value={van || def} onChange={(e) => onChange({ van: e.target.value })} disabled={disabled} className="w-full border border-line rounded-xl px-3 h-12 text-base bg-white">
          {choices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      {job === "sales_agent" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          مشرف المبيعات المسؤول عنه
          <select value={supervisorUid || ""} onChange={(e) => onChange({ supervisorUid: e.target.value })} disabled={disabled} className="w-full border border-line rounded-xl px-3 h-12 text-base bg-white">
            <option value="">بدون مشرف محدد (أي مشرف)</option>
            {supervisors.map((s) => <option key={s.uid} value={s.uid}>{s.displayName || s.email}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

// العربات — the admin adds vans and renames / deactivates them. A van's
// sales type is fixed once created.
function VansPanel({ token, vans, onSaved, onError }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", type: "wholesale" });
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save(body) {
    setBusy(true);
    try {
      await send(token, "/api/vans", "POST", body);
      onSaved("تم حفظ العربة");
      setAdding(false);
      setEdit(null);
      setForm({ label: "", type: "wholesale" });
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-white rounded-2xl shadow p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">العربات</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="h-11 px-4 rounded-xl bg-accent text-on-accent font-semibold flex items-center gap-2">
            <Icon name="plus" size={18} /> إضافة عربة
          </button>
        )}
      </div>
      {adding && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:items-end">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">اسم العربة
            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} maxLength={40} className="w-full border border-line rounded-xl px-3 h-12 text-base" placeholder="مثال: عربة جملة 2" />
          </label>
          <RouteSelect value={form.type === "wholesale" ? "car1" : "car2"} onChange={(r) => setForm((f) => ({ ...f, type: TYPE_OF_ROUTE[r] }))} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAdding(false)} className="h-12 px-4 rounded-xl border border-line font-semibold">إلغاء</button>
            <button type="button" disabled={busy} onClick={() => save(form)} className="h-12 px-4 rounded-xl bg-accent text-on-accent font-semibold">حفظ</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-line">
        {vans.map((v) => (
          <li key={v.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
            {edit === v.id ? (
              <EditVan v={v} busy={busy} onCancel={() => setEdit(null)} onSave={(label, active) => save({ id: v.id, label, type: v.type, active })} />
            ) : (
              <>
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{v.label}</span>
                  <span className="text-sm text-ink-soft"> · {v.type === "wholesale" ? "جملة" : "تجزئة"}{v.active === false ? " · موقوفة" : ""}</span>
                </span>
                <button type="button" onClick={() => setEdit(v.id)} className="h-10 px-3 rounded-xl border border-line text-sm font-semibold">تعديل</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
function EditVan({ v, busy, onCancel, onSave }) {
  const [label, setLabel] = useState(v.label);
  const [active, setActive] = useState(v.active !== false);
  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:items-center">
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className="w-full border border-line rounded-xl px-3 h-12 text-base" />
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-5 h-5" /> نشطة</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-11 px-3 rounded-xl border border-line font-semibold">إلغاء</button>
        <button type="button" disabled={busy} onClick={() => onSave(label, active)} className="h-11 px-3 rounded-xl bg-accent text-on-accent font-semibold">حفظ</button>
      </div>
    </div>
  );
}

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

const isSales = (job) => job === "sales_supervisor" || job === "sales_agent";
const routeLabel = (route) => SALES_ROUTES.find((r) => r.route === route)?.label || "";
const jobLabel = (job, route) => (job ? `${ROLE_LABELS[job] || job}${isSales(job) && route ? ` — ${routeLabel(route)}` : ""}` : "بدون صلاحية");

function RouteSelect({ value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="نوع البيع" className="grid grid-cols-2 gap-2">
      {SALES_ROUTES.map((r) => (
        <button
          key={r.route}
          type="button"
          role="radio"
          aria-checked={value === r.route}
          disabled={disabled}
          onClick={() => onChange(r.route)}
          className={`h-11 rounded-xl border text-sm font-semibold ${value === r.route ? "bg-accent text-on-accent border-accent" : "bg-white text-ink-soft border-line"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function RoleBadge({ role, route }) {
  if (!role) return <span className="h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center bg-amber-100 text-amber-700">بدون صلاحية</span>;
  const tone = role === "admin" ? "bg-solid-ink text-snow" : "bg-accent-soft text-accent-ink";
  return <span className={`h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center ${tone}`}>{jobLabel(role, route)}</span>;
}

function NewAccount({ token, onCreated, onCancel, vans, supervisors }) {
  const [form, setForm] = useState({ displayName: "", nameEn: "", email: "", password: "", role: "", route: "", van: "", supervisorUid: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isSales(form.role) && !form.route) throw new Error("اختر المسار: جملة أو تجزئة");
      const { user } = await send(token, "/api/admin/users", "POST", { ...form, role: form.role || null, route: form.route || null });
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
          الاسم بالعربية
          <input value={form.displayName} onChange={set("displayName")} maxLength={60} className={field} placeholder="مثال: يونس أحمد" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          الاسم بالإنجليزية (اختياري)
          <input dir="ltr" value={form.nameEn} onChange={set("nameEn")} maxLength={80} className={`${field} text-start`} placeholder="e.g. Younis Ahmed" data-no-translate />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          البريد الإلكتروني
          <input type="email" required dir="ltr" value={form.email} onChange={set("email")} className={field} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          كلمة المرور المؤقتة
          <PasswordInput required minLength={8} value={form.password} onChange={set("password")} inputClassName={field} autoComplete="new-password" />
          <span className="text-xs text-muted font-normal">8 أحرف على الأقل — سلّمها للموظف ليغيّرها لاحقًا.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
          الصلاحية
          <select value={form.role} onChange={set("role")} className={field}>
            <option value="">بدون صلاحية (لا يستطيع الدخول)</option>
            {ROLE_DEFS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        {isSales(form.role) && (
          <div className="sm:col-span-2 flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
            المسار
            <RouteSelect value={form.route} onChange={(route) => setForm((f) => ({ ...f, route, van: "" }))} />
          </div>
        )}
        {isSales(form.role) && <Assignment route={form.route} job={form.role} van={form.van} supervisorUid={form.supervisorUid} vans={vans} supervisors={supervisors} onChange={(x) => setForm((f) => ({ ...f, ...x }))} />}
      </div>
      <button disabled={busy} className="h-12 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy && <Spinner className="w-4 h-4" />}
        إنشاء الحساب
      </button>
    </form>
  );
}

// One account. Read-only until "تعديل" is pressed: then name (Arabic and
// English), job and route can be changed and saved together — so nothing
// changes by an accidental tap on a select box.
function AccountRow({ u, me, token, onSaved, onError, vans, supervisors }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const isMe = u.uid === me;
  const who = u.displayName || u.email;

  function startEdit() {
    setDraft({ displayName: u.displayName || "", nameEn: u.nameEn || "", role: u.job || "", route: u.route || "", van: u.van || "", supervisorUid: u.supervisorUid || "" });
    setEditing(true);
    setPwOpen(false);
  }

  async function patch(kind, body, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(kind);
    try {
      const { user } = await send(token, `/api/admin/users/${encodeURIComponent(u.uid)}`, "PATCH", body);
      onSaved(user, kind);
      return true;
    } catch (err) {
      onError(err.message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function save(e) {
    e.preventDefault();
    const body = {};
    if (draft.displayName.trim() !== (u.displayName || "")) body.displayName = draft.displayName;
    if (draft.nameEn.trim() !== (u.nameEn || "")) body.nameEn = draft.nameEn;
    const roleChanged =
      (draft.role || null) !== (u.job || null) ||
      (isSales(draft.role) && (draft.route !== (u.route || "") || (draft.van || u.van || "") !== (u.van || "") || (draft.supervisorUid || "") !== (u.supervisorUid || "")));
    if (!isMe && (roleChanged || u.legacyRole)) {
      if (isSales(draft.role) && !draft.route) return onError("اختر المسار: جملة أو تجزئة");
      body.role = draft.role || null;
      body.route = isSales(draft.role) ? draft.route : null;
      if (isSales(draft.role)) {
        body.van = draft.van || null;
        body.supervisorUid = draft.role === "sales_agent" ? draft.supervisorUid || null : null;
      }
    }
    if (!Object.keys(body).length) return setEditing(false);
    const confirmText = roleChanged && !isMe ? `تغيير صلاحية ${who} إلى «${jobLabel(draft.role, draft.route)}»؟ سيُسجَّل خروجه من كل أجهزته.` : null;
    if (await patch("save", body, confirmText)) setEditing(false);
  }

  const def = ROLE_DEFS.find((r) => r.id === (editing ? draft.role : u.job));

  return (
    <li className={`p-4 sm:p-5 flex flex-col gap-3 ${u.disabled ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink flex flex-wrap items-center gap-2">
            {u.displayName || u.email}
            {isMe && <span className="text-xs text-muted font-normal">(أنت)</span>}
            {u.disabled && <span className="h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center bg-red-100 text-red-700">موقوف</span>}
          </p>
          {u.nameEn && <p className="text-sm text-ink-soft mt-0.5" dir="ltr" style={{ textAlign: "start" }} data-no-translate>{u.nameEn}</p>}
          {u.displayName && <p className="text-sm text-muted mt-0.5" dir="ltr" style={{ textAlign: "start" }}>{u.email}</p>}
          <p className="text-xs text-muted mt-1">آخر دخول: {u.lastSignIn ? formatDateTime(u.lastSignIn) : "لم يدخل بعد"}</p>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={u.job} route={u.route} />
          {!editing && (
            <button type="button" onClick={startEdit} className="h-9 px-3.5 rounded-xl border border-line text-sm font-semibold text-ink-soft flex items-center gap-1.5 hover:border-accent hover:text-accent-ink">
              <Icon name="pencil" size={15} />
              تعديل
            </button>
          )}
        </div>
      </div>
      {!editing && def && <p className="text-xs text-muted -mt-1">{def.hint}</p>}
      {!editing && u.legacyRole && <p className="text-xs text-amber-700">مسجّل بالصيغة القديمة — اضغط «تعديل» ثم «حفظ» لتحديثه.</p>}

      {editing && (
        <form onSubmit={save} className="rounded-2xl bg-surface-2 p-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              الاسم بالعربية
              <input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} maxLength={60} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              الاسم بالإنجليزية
              <input dir="ltr" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} maxLength={80} placeholder="e.g. Ahmed Ali" className={`${field} text-start`} data-no-translate />
            </label>
          </div>
          {!isMe && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              الصلاحية
              <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={field}>
                <option value="">بدون صلاحية</option>
                {ROLE_DEFS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
          )}
          {!isMe && isSales(draft.role) && <RouteSelect value={draft.route} onChange={(route) => setDraft({ ...draft, route, van: "" })} disabled={!!busy} />}
          {!isMe && isSales(draft.role) && <Assignment route={draft.route} job={draft.role} van={draft.van} supervisorUid={draft.supervisorUid} vans={vans} supervisors={supervisors.filter((x) => x.uid !== u.uid)} onChange={(x) => setDraft({ ...draft, ...x })} disabled={!!busy} />}
          {def && <p className="text-xs text-muted">{def.hint}</p>}
          {isMe && <p className="text-xs text-muted">لا يمكنك تغيير صلاحية حسابك أنت.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-xl border border-line bg-white font-semibold text-ink-soft">إلغاء</button>
            <button disabled={!!busy} className="h-11 rounded-xl bg-accent text-on-accent font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy === "save" && <Spinner className="w-4 h-4" />}
              حفظ
            </button>
          </div>

          {!isMe && (
            <div className="border-t border-line pt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => patch("disabled", { disabled: !u.disabled }, u.disabled ? null : `إيقاف حساب ${who}؟ لن يستطيع الدخول حتى تعيد تفعيله.`)}
                className={`h-10 px-3.5 rounded-xl text-sm font-semibold border bg-white flex items-center gap-2 ${u.disabled ? "border-accent text-accent-ink" : "border-red-200 text-red-700"}`}
              >
                {busy === "disabled" && <Spinner className="w-4 h-4" />}
                <Icon name={u.disabled ? "check" : "lock"} size={16} />
                {u.disabled ? "إعادة التفعيل" : "إيقاف الحساب"}
              </button>
              <button type="button" onClick={() => setPwOpen((v) => !v)} className="h-10 px-3.5 rounded-xl text-sm font-semibold border border-line bg-white text-ink-soft flex items-center gap-2">
                <Icon name="lock" size={16} />
                كلمة مرور جديدة
              </button>
            </div>
          )}
          {pwOpen && (
            <div className="flex flex-wrap gap-2">
              <PasswordInput minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8 أحرف على الأقل" className="flex-1 min-w-[200px]" inputClassName={field} autoComplete="new-password" />
              <button
                type="button"
                disabled={!!busy || pw.length < 8}
                onClick={async () => {
                  if (await patch("password", { password: pw }, `تعيين كلمة مرور جديدة لـ ${who}؟ سيُسجَّل خروجه من كل أجهزته.`)) {
                    setPw("");
                    setPwOpen(false);
                  }
                }}
                className="h-11 px-4 rounded-xl bg-solid-ink text-snow text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {busy === "password" && <Spinner className="w-4 h-4" />}
                تعيين
              </button>
            </div>
          )}
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
    const label = (x) => (!x ? "بدون" : typeof x === "string" ? ROLE_LABELS[x] || x : jobLabel(x.job, x.route));
    if (e.action === "create") return `إنشاء حساب ${d.email || ""}${d.role ? ` بصلاحية «${jobLabel(d.role, d.route)}»` : ""}`;
    const parts = [];
    if (d.role) parts.push(`الصلاحية: ${label(d.role.from)} ← ${label(d.role.to)}`);
    if (d.disabled === true) parts.push("إيقاف الحساب");
    if (d.disabled === false) parts.push("إعادة التفعيل");
    if (d.password) parts.push("كلمة مرور جديدة");
    if (d.displayName !== undefined || d.nameEn !== undefined) parts.push("تعديل الاسم");
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
  const vans = useVans(token);
  const supervisors = useMemo(() => (users || []).filter((x) => x.job === "sales_supervisor" && !x.disabled), [users]);

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
      const k = u.job || "none";
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [users]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (roleFilter !== "all" && (u.job || "none") !== roleFilter) return false;
      return !s || u.email.toLowerCase().includes(s) || u.displayName.toLowerCase().includes(s) || (u.nameEn || "").toLowerCase().includes(s);
    });
  }, [users, q, roleFilter]);

  function saved(u, kind) {
    setUsers((list) => list.map((x) => (x.uid === u.uid ? u : x)));
    setToast(kind === "password" ? "تم تعيين كلمة المرور" : kind === "disabled" ? (u.disabled ? "تم إيقاف الحساب" : "تم تفعيل الحساب") : "تم حفظ التعديلات");
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

        <VansPanel token={token} vans={vans} onSaved={(m) => setToast(m)} onError={(m) => setError(m)} />

        {adding && (
          <NewAccount
            token={token}
            vans={vans}
            supervisors={supervisors}
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
              <AccountRow key={u.uid} u={u} me={user?.uid} token={token} onSaved={saved} onError={(m) => setError(m)} vans={vans} supervisors={supervisors} />
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
