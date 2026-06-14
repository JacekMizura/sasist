import { Check, ChevronDown, Package } from "lucide-react";
import { useMemo, useState } from "react";
import type { WmsPickingOrderBundleTreeApi } from "../../../api/wmsPickingProductsApi";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  trees: WmsPickingOrderBundleTreeApi[];
  className?: string;
};

export function BundlePickingOrderTree({ trees, className = "" }: Props) {
  const byOrder = useMemo(() => {
    const map = new Map<number, { orderNumber: string; bundles: WmsPickingOrderBundleTreeApi[] }>();
    for (const t of trees) {
      const cur = map.get(t.order_id);
      if (cur) {
        cur.bundles.push(t);
      } else {
        map.set(t.order_id, { orderNumber: t.order_number, bundles: [t] });
      }
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [trees]);

  if (byOrder.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {byOrder.map(([orderId, { orderNumber, bundles }]) => (
        <div key={orderId} className="rounded-xl border border-indigo-100 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50/80 border-b border-indigo-100">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-700">
              Zamówienie {orderNumber}
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {bundles.map((bundle) => (
              <BundleBlock key={`${orderId}-${bundle.parent_order_line_id}`} bundle={bundle} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BundleBlock({ bundle }: { bundle: WmsPickingOrderBundleTreeApi }) {
  const [open, setOpen] = useState(true);
  const done = bundle.components_done;
  const total = bundle.components_total;
  const allDone = total > 0 && done >= total;

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
      >
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <Package size={14} className="shrink-0 text-[#5a4fcf]" />
        <span className="min-w-0 flex-1 text-sm font-bold text-slate-900 truncate">{bundle.bundle_name}</span>
        <span
          className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md ${
            allDone ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {done}/{total}
        </span>
      </button>
      {open ? (
        <ul className="pb-2 px-3 space-y-1">
          {bundle.components.map((c) => {
            const checked = c.pick_done;
            const highlight = c.is_current_product;
            return (
              <li
                key={c.order_item_id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                  highlight ? "bg-indigo-50 ring-1 ring-indigo-200" : "bg-slate-50/60"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {checked ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                <span className={`min-w-0 flex-1 font-semibold ${highlight ? "text-indigo-900" : "text-slate-700"}`}>
                  {c.product_name}
                </span>
                <span className="shrink-0 tabular-nums font-bold text-slate-500">
                  {c.bundle_component_index}/{bundle.components_total}
                </span>
                {!checked && c.quantity_to_pick > 1e-9 ? (
                  <span className="shrink-0 font-black text-[#5a4fcf] tabular-nums">×{fmtQty(c.quantity_to_pick)}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
