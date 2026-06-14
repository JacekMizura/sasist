import { Package } from "lucide-react";
import type { ConsolidationRackBundleRowOut } from "../../../api/bundlesLogisticsApi";
import { consolidationRackHeading } from "../../../utils/bundleScanFlow";

type Props = {
  rows: ConsolidationRackBundleRowOut[];
  shelfLabel?: string | null;
  className?: string;
};

export function BundleConsolidationRackCard({ rows, shelfLabel, className = "" }: Props) {
  if (rows.length === 0) return null;
  const heading = consolidationRackHeading(rows);

  return (
    <div className={`rounded-2xl border border-violet-200 bg-violet-50/40 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-violet-100 bg-white/70 flex items-center gap-2">
        <Package size={16} className="text-violet-700 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900">{heading}</p>
          {shelfLabel ? (
            <p className="text-xs font-semibold text-violet-700">Półka: {shelfLabel}</p>
          ) : null}
        </div>
      </div>
      <ul className="divide-y divide-violet-100/80">
        {rows.map((r, i) => (
          <li key={`${r.bundle_id}-${r.product_id ?? i}`} className="px-4 py-2.5 flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 font-semibold text-slate-800 truncate">
              {r.display_mode === "stock_finished_bundle" ? r.bundle_name : r.product_name ?? r.bundle_name}
            </span>
            <span className="shrink-0 text-xs font-mono text-slate-500">{r.ean ?? r.sku ?? "—"}</span>
            <span className="shrink-0 font-black tabular-nums text-violet-800">×{r.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
