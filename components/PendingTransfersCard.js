import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { apiFetch } from "../lib/apiFetch";
import { cachedGet, invalidate } from "../lib/apiCache";
import { useLiveRefresh } from "../lib/useLiveRefresh";

// Warehouse keeper's home: a single prompt when the supervisor has created
// transfers waiting to be released. Renders nothing otherwise, so the
// home screen stays quiet when there's no transfer work.
export default function PendingTransfersCard({ token }) {
  const [count, setCount] = useState(0);
  function load() {
    cachedGet(apiFetch, "/api/transfers/list?status=pending", token)
      .then((d) => setCount((d.transfers || []).length))
      .catch(() => {});
  }
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useLiveRefresh(token, ["transfers"], () => {
    invalidate("/api/transfers/list");
    load();
  });
  if (!count) return null;
  return (
    <Link
      href="/warehouse/transfers"
      className="mb-5 flex items-center gap-3 bg-white rounded-2xl shadow px-3.5 py-3 min-h-[68px] active:bg-surface-2"
    >
      <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <Icon name="truck" size={20} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[0.9375rem] font-semibold text-ink">
          {count === 1 ? "تحويل بانتظار الإخراج" : `${count} تحويلات بانتظار الإخراج`}
        </span>
        <span className="block text-xs text-muted mt-0.5">من المدير — أخرجها من المخزن عند التسليم</span>
      </span>
      <span className="shrink-0 h-8 px-3 rounded-lg bg-amber-100 text-amber-700 text-[0.8125rem] font-bold flex items-center">افتح</span>
    </Link>
  );
}
