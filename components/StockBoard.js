import { useMemo, useState } from "react";
import Icon from "./Icon";
import { formatQty, ROUTE_LABELS_SHORT } from "../lib/labels";
import { ROUTES } from "../lib/roles";

import { vanName } from "../lib/vanNames";
import { useVanNames } from "../lib/useVans";
// Read-only stock balances by location: main depot, every van, damaged.
// `products`: [{ id, name, unit, stock: { depot, car1, car2, damaged }, lowStock? }]
// Phones get one card per product; wide screens get a table.
// Depot, then every van found in the products' stock (lib/vans.js — not
// just the original two), then damaged.
function locationsOf(products) {
  const vans = new Set(ROUTES);
  (products || []).forEach((p) => Object.keys(p.stock || {}).forEach((k) => k !== "depot" && k !== "damaged" && vans.add(k)));
  return [{ key: "depot", label: "المخزن الرئيسي" }, ...[...vans].filter((k) => (products || []).some((p) => p.stock && k in p.stock) || ROUTES.includes(k)).map((r) => ({ key: r, label: vanName(r) || ROUTE_LABELS_SHORT[r] || r })), { key: "damaged", label: "تالف" }];
}

export default function StockBoard({ products, showDamaged = true }) {
  const [q, setQ] = useState("");
  useVanNames();
  const LOCATIONS = locationsOf(products);
  const locs = showDamaged ? LOCATIONS : LOCATIONS.filter((l) => l.key !== "damaged");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (products || [])
      .filter((p) => !s || (p.name || "").toLowerCase().includes(s))
      .map((p) => {
        const by = Object.fromEntries(locs.map((l) => [l.key, Number(p.stock?.[l.key]) || 0]));
        const total = locs.filter((l) => l.key !== "damaged").reduce((a, l) => a + by[l.key], 0);
        return { ...p, by, total };
      });
  }, [products, q, locs]);
  const totals = Object.fromEntries(locs.map((l) => [l.key, rows.reduce((a, r) => a + r.by[l.key], 0)]));
  const grand = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {locs.map((l) => (
          <div key={l.key} className="bg-white rounded-2xl shadow px-4 py-3">
            <p className="text-xs text-muted">{l.label}</p>
            <p className="num text-xl font-bold text-ink mt-1">{formatQty(totals[l.key])}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Icon name="search" size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج..." className="h-11 w-full rounded-xl border border-line bg-white ps-10 pe-3 text-base" />
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">لا توجد منتجات.</p>
      ) : (
        <>
          <ul className="md:hidden bg-white rounded-2xl shadow divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="text-sm text-muted">الإجمالي <span className="num font-bold text-ink">{formatQty(p.total)}</span> {p.unit}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                  {locs.map((l) => (
                    <div key={l.key} className="flex justify-between gap-2">
                      <span className="text-muted">{l.label}</span>
                      <span className={`num font-medium ${l.key === "depot" && p.lowStock ? "text-amber-700" : "text-ink"}`}>{formatQty(p.by[l.key])}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block bg-white rounded-2xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-line">
                  <th className="text-start font-semibold px-4 py-3">المنتج</th>
                  {locs.map((l) => <th key={l.key} className="text-end font-semibold px-4 py-3">{l.label}</th>)}
                  <th className="text-end font-semibold px-4 py-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-ink font-medium">
                      {p.name} <span className="text-xs text-muted">{p.unit}</span>
                      {p.lowStock && <span className="ms-2 text-xs text-amber-700">رصيد منخفض</span>}
                    </td>
                    {locs.map((l) => <td key={l.key} className="num px-4 py-3 text-end text-ink">{formatQty(p.by[l.key])}</td>)}
                    <td className="num px-4 py-3 text-end font-bold text-ink">{formatQty(p.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-surface-2 font-bold">
                  <td className="px-4 py-3">الإجمالي</td>
                  {locs.map((l) => <td key={l.key} className="num px-4 py-3 text-end">{formatQty(totals[l.key])}</td>)}
                  <td className="num px-4 py-3 text-end">{formatQty(grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted">الإجمالي = المخزن الرئيسي + السيارات (بدون التالف).</p>
        </>
      )}
    </div>
  );
}
