import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "../../lib/useAuth";
import { useVans } from "../../lib/useVans";
import { useNotifications } from "../../lib/useNotifications";
import { getAuthFlags } from "../../lib/authFlags";
import Nav from "../../components/Nav";
import Icon from "../../components/Icon";
import { PageLoading } from "../../components/Loading";

// العربات — one card per van: its name, who works on it (supervisor first),
// and a dot when something on that van needs the keeper. Tap a van for its
// section: requests to execute, movements, filters — as before for
// wholesale / retail.
export default function WarehouseVans() {
  const { role, token, loading, logout } = useAuth(["warehouse_keeper", "manager"]);
  const vans = useVans(token);
  const { items } = useNotifications(token, role, getAuthFlags().uid);
  const waiting = useMemo(() => {
    const c = {};
    for (const it of items || []) if (it.needsAction && it.bucket === "shipping" && it.route) c[it.route] = (c[it.route] || 0) + 1;
    return c;
  }, [items]);
  if (loading) return <PageLoading />;
  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <Nav role={role} logout={logout} />
      <main className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-5 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">العربات</h1>
          <p className="text-ink-soft mt-1">اختر عربة لطلباتها وحركاتها.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vans
            .filter((v) => v.active !== false)
            .map((v) => {
              const n = waiting[v.id] || 0;
              return (
                <Link key={v.id} href={`/warehouse/${v.id}`} className={`relative bg-white rounded-3xl shadow p-5 flex flex-col gap-3 min-w-0 hover:shadow-lg active:bg-surface-2 ${n ? "border-2 border-amber-400" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-12 h-12 rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                        <Icon name="truck" size={24} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-xl font-bold text-ink break-words">{v.label}</p>
                        <p className="text-ink-soft">{v.type === "retail" ? "تجزئة" : "جملة"}</p>
                      </div>
                    </div>
                    {n > 0 && (
                      <span className="shrink-0 rounded-full bg-red-600 text-snow font-bold min-w-[1.75rem] h-7 px-2 flex items-center justify-center num" aria-label={`${n} بانتظارك`}>
                        {n}
                      </span>
                    )}
                  </div>
                  {v.people?.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {v.people.map((p) => (
                        <li key={p.uid} className="flex items-center gap-2 text-ink">
                          <Icon name="users" size={16} className="text-ink-soft shrink-0" />
                          <span className="break-words">{p.name}</span>
                          {p.supervisor && <span className="text-xs font-semibold text-accent-ink bg-accent-soft rounded-md px-1.5 py-0.5">مشرف</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-ink-soft">لا يوجد مندوب معيّن لهذه العربة</p>
                  )}
                  {n > 0 && <p className="text-amber-800 font-semibold">{n} طلب بانتظار تنفيذك</p>}
                </Link>
              );
            })}
        </div>
      </main>
    </div>
  );
}
