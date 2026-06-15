import { Check, Package } from "lucide-react";
import type { BundlePickingDisplay } from "../../../utils/bundleScanFlow";
import { pickingBundleProgressLabel } from "../../../utils/bundleScanFlow";

type Props = {
  display: BundlePickingDisplay;
  className?: string;
};

/** ON_DEMAND / STOCK wynik skanu bundle w pickingu — spójny z BundlePickingOrderTree. */
export function BundlePickingScanCard({ display, className = "" }: Props) {
  const progress = pickingBundleProgressLabel(display);
  const allDone = display.mode === "STOCK" || (display.totalCount > 0 && display.doneCount >= display.totalCount);

  return (
    <div className={`rounded-2xl border border-indigo-200 bg-white overflow-hidden shadow-sm ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50/80 border-b border-indigo-100">
        <Package size={18} className="shrink-0 text-[#5a4fcf]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900 truncate">{display.title}</p>
          <p className="text-xs font-semibold text-slate-500">{display.subtitle}</p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg ${
            allDone ? "bg-emerald-500 text-white" : "bg-indigo-200 text-indigo-900"
          }`}
        >
          {progress}
        </span>
      </div>
      {display.mode === "ON_DEMAND" && display.components.length > 0 ? (
        <ul className="divide-y divide-slate-100 px-2 py-1">
          {display.components.map((c) => (
            <li key={c.order_item_id} className="flex items-center gap-2 px-2 py-2 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  c.pick_done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                }`}
              >
                {c.pick_done ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              <span className={`min-w-0 flex-1 font-semibold ${c.pick_done ? "text-emerald-800" : "text-slate-800"}`}>
                {c.product_name}
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500">
                {c.index}/{c.total}
              </span>
            </li>
          ))}
        </ul>
      ) : display.mode === "STOCK" ? (
        <p className="px-4 py-3 text-sm font-semibold text-emerald-800 bg-emerald-50">Linia bundle SKU — zebrano</p>
      ) : null}
    </div>
  );
}
