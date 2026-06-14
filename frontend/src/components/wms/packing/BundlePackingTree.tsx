import { Check, Package } from "lucide-react";
import type { WmsPackingBundleTreeNodeApi } from "../../../api/wmsPackingApi";

type Props = {
  trees: WmsPackingBundleTreeNodeApi[];
  className?: string;
};

export function BundlePackingTree({ trees, className = "" }: Props) {
  if (!trees.length) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {trees.map((tree) => (
        <div
          key={tree.parent_order_line_id}
          className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden shadow-sm"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-100 bg-white/70">
            <Package size={16} className="shrink-0 text-violet-700" />
            <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">{tree.bundle_name}</span>
            <span
              className={`shrink-0 text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-lg ${
                tree.is_complete ? "bg-emerald-500 text-white" : "bg-violet-200 text-violet-900"
              }`}
            >
              {tree.components_packed}/{tree.components_total}
            </span>
          </div>
          <ul className="divide-y divide-violet-100/80 px-2 py-1">
            {tree.components.map((c) => (
              <li key={c.order_item_id} className="flex items-center gap-2 px-2 py-2 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    c.is_packed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {c.is_packed ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className={`min-w-0 flex-1 font-semibold ${c.is_packed ? "text-emerald-800" : "text-slate-800"}`}>
                  {c.product_name}
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500">
                  {c.quantity_packed}/{c.quantity_required}
                </span>
              </li>
            ))}
          </ul>
          {tree.is_complete ? (
            <p className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border-t border-emerald-100">
              Bundle gotowy
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
