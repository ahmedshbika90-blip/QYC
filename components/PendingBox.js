import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet, invalidate } from "../lib/apiCache";
import { formatDateTime, shortCode } from "../lib/labels";
import { TYPE_LABELS, previewNames } from "./InventoryDocCard";

// The agent's single "pending" box. It replaces the separate "بانتظارك" and
// "بانتظار موافقتي" sections. Two directions, one list:
//   needs YOU — loading receipts to confirm; (car1) the retail agent's
//               requests waiting for your approval
//   sent by YOU — your shipment requests not yet approved/fulfilled; your
//               invoice edit/cancel requests waiting for the supervisor
// "Needs you" items come first; each row is tagged so the two directions
// can't be confused at a glance.
const SHIP_WAIT = { pending_car1: "بانتظار مشرف المبيعات", pending_warehouse: "بانتظار أمين المخزن" };

export default function PendingBox({ token, pendingMovements = [], toDecide = [], refreshKey }) {
  const [ownShip, setOwnShip] = useState([]);
  const [ownChange, setOwnChange] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    invalidate("/api/shipment-requests/list?scope=own");
    invalidate("/api/requests/list");
    Promise.all([
      cachedGet(apiFetch, "/api/shipment-requests/list?scope=own", token).catch(() => ({ requests: [] })),
      cachedGet(apiFetch, "/api/requests/list?status=pending", token).catch(() => ({ requests: [] })),
    ]).then(([s, c]) => {
      setOwnShip((s.requests || []).filter((r) => SHIP_WAIT[r.status]));
      setOwnChange(c.requests || []);
      setLoaded(true);
    });
  }, [token, refreshKey]);

  const needsYou = [
    ...pendingMovements.map((d) => ({
      key: "d" + d.id,
      href: `/inventory/${d.id}`,
      icon: d.type === "offloading" ? "box" : "truck",
      title: `${TYPE_LABELS[d.type] || d.type} — أكّد الاستلام`,
      meta: `${previewNames(d.items)} · ${formatDateTime(d.createdAt)}`,
    })),
    ...toDecide.map((r) => ({
      key: "t" + r.id,
      href: `/shipping/${r.id}`,
      icon: r.type === "offloading" ? "box" : "truck",
      title: `${r.type === "loading" ? "أمر شحن" : "مرتجع بضاعة"} من التجزئة — بانتظار قرارك`,
      meta: `${previewNames(r.items)} · ${formatDateTime(r.requestedAt)}`,
    })),
  ];
  const sentByYou = [
    ...ownShip.map((r) => ({
      key: "s" + r.id,
      href: `/shipping/${r.id}`,
      icon: r.type === "offloading" ? "box" : "truck",
      title: `${r.type === "loading" ? "أمر شحن" : "مرتجع بضاعة"} — ${SHIP_WAIT[r.status]}`,
      meta: `${previewNames(r.items)} · ${formatDateTime(r.requestedAt)}`,
    })),
    ...ownChange.map((r) => ({
      key: "c" + r.id,
      href: `/requests/${r.id}`,
      icon: "inbox",
      title:
        r.type === "client_edit"
          ? "طلب تعديل عميل — بانتظار المدير"
          : `${r.type === "cancel" ? "طلب إلغاء" : "طلب تعديل"} فاتورة ${shortCode(r.orderId)} — بانتظار المدير`,
      meta: formatDateTime(r.createdAt || r.requestedAt),
    })),
  ];

  const total = needsYou.length + sentByYou.length;
  const Row = ({ it, mine }) => (
    <li>
      <Link href={it.href} className="flex items-center gap-3 px-3.5 py-3 min-h-[68px] active:bg-surface-2">
        <span
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            mine ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          <Icon name={it.icon} size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[0.9375rem] font-semibold text-ink leading-snug line-clamp-2">{it.title}</span>
          <span className="block text-xs text-muted truncate mt-0.5">{it.meta}</span>
        </span>
        <span
          className={`shrink-0 h-7 px-2.5 rounded-lg text-[0.75rem] font-bold flex items-center ${
            mine ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {mine ? "أرسلتها" : "بانتظارك"}
        </span>
      </Link>
    </li>
  );

  return (
    <section aria-label="الطلبات المعلّقة" className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="text-base font-bold text-ink">الطلبات المعلّقة</h2>
        {needsYou.length > 0 && (
          <span className="num min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
            {needsYou.length}
          </span>
        )}
      </div>
      {!loaded && total === 0 ? (
        <div className="bg-white rounded-2xl shadow h-[68px] animate-pulse" />
      ) : total === 0 ? (
        <div className="bg-white rounded-2xl shadow px-4 py-3.5 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center">
            <Icon name="check" size={20} strokeWidth={2.6} />
          </span>
          <p className="text-sm text-ink-soft">لا طلبات معلّقة</p>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow divide-y divide-line overflow-hidden">
          {needsYou.map((it) => <Row key={it.key} it={it} mine={false} />)}
          {sentByYou.map((it) => <Row key={it.key} it={it} mine />)}
        </ul>
      )}
    </section>
  );
}
