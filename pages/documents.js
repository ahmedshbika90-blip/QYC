import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import Nav from "../components/Nav";
import BackButton from "../components/BackButton";
import InventoryHistory from "../components/InventoryHistory";
import ShipmentRequestsPanel from "../components/ShipmentRequestsPanel";
import { TYPE_LABELS, previewNames } from "../components/InventoryDocCard";
import { PageLoading } from "../components/Loading";
import Icon from "../components/Icon";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet, invalidate } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { formatDateTime } from "../lib/labels";

// Everything related to physical goods movement on this car: submitting
// a shipping order or a cargo return, seeing their status (car1 also
// approves/rejects car2's), and the archive.
//
// The archive is where a document LIVES, confirmed or not. Unconfirmed
// ones are pinned at the top of it with a "أكّد الاستلام" action that
// opens the document directly — previously they appeared only on the home
// screen, and this page just pointed back there, which made confirming a
// receipt a two-stop detour. The tab carries a dot while any are waiting.
export default function Documents() {
  const { role, token, loading, logout } = useAuth(["agent_car1", "agent_car2"]);
  const router = useRouter();
  const [tab, setTab] = useState("shipping");

  // ?tab=archive lets the home screen (and notifications) link straight
  // into the archive instead of landing on the default "شحن" tab.
  useEffect(() => {
    if (router.query.tab === "archive" || router.query.tab === "shipping") setTab(router.query.tab);
  }, [router.query.tab]);
  const [pending, setPending] = useState([]);

  const loadPending = useCallback(() => {
    if (!token) return;
    cachedGet(apiFetch, "/api/inventory/list?status=pending", token)
      .then((d) => setPending(d.docs || []))
      .catch(() => {});
  }, [token]);

  useEffect(loadPending, [loadPending]);

  useLiveRefresh(token, ["inventory"], () => {
    invalidate("/api/inventory/list");
    loadPending();
  });

  if (loading) return <PageLoading />;

  const tabs = [
    ["shipping", "شحن", 0],
    ["archive", "الأرشيف", pending.length],
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <Nav role={role} logout={logout} />
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-8 sm:px-8">
        <BackButton />
        <h1 className="font-display text-2xl font-bold mb-4 text-ink">المستندات</h1>

        <div role="tablist" className="inline-flex gap-1 p-1 rounded-xl bg-surface-2 mb-4">
          {tabs.map(([key, label, dot]) => {
            const on = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(key)}
                className={`relative whitespace-nowrap h-10 px-4 rounded-lg text-sm ${
                  on ? "bg-white text-ink font-semibold shadow-sm" : "text-muted"
                }`}
              >
                {label}
                {dot > 0 && (
                  <span className="absolute top-1 end-1 w-2.5 h-2.5 rounded-full bg-amber-600 ring-2 ring-white">
                    <span className="sr-only">يوجد {dot} بانتظار تأكيدك</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "shipping" ? (
          <ShipmentRequestsPanel role={role} token={token} />
        ) : (
          <>
            {pending.length > 0 && (
              <section aria-label="بانتظار تأكيدك" className="mb-5">
                <h2 className="text-sm font-bold text-amber-700 mb-2">بانتظار تأكيدك</h2>
                <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
                  {pending.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/inventory/${d.id}`}
                        className="flex items-center gap-3 px-3.5 py-3 min-h-[68px] active:bg-surface-2"
                      >
                        <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Icon name={d.type === "offloading" ? "box" : "truck"} size={20} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-semibold text-ink truncate">
                            {TYPE_LABELS[d.type] || d.type}
                          </span>
                          <span className="block text-xs text-muted truncate mt-0.5">
                            {previewNames(d.items)} · {formatDateTime(d.createdAt)}
                          </span>
                        </span>
                        <span className="shrink-0 h-8 px-3 rounded-lg bg-amber-100 text-amber-700 text-[13px] font-bold flex items-center">
                          أكّد الاستلام
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <InventoryHistory
              token={token}
              excludePending
              showRouteFilter={false}
              emptyText="لا توجد مستندات مؤكدة في هذه الفترة."
            />
          </>
        )}
      </main>
    </div>
  );
}
