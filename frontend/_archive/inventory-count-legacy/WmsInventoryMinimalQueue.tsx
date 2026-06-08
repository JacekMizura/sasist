import { AlertTriangle, Loader2 } from "lucide-react";

import type { InventoryTaskCompact } from "@/api/inventoryCountApi";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  items: InventoryTaskCompact[];
  loading?: boolean;
  onSelect: (task: InventoryTaskCompact) => void;
};

/** Tiny operational queue — location, progress, anomaly icon only. */
export default function WmsInventoryMinimalQueue({ items, loading, onSelect }: Props) {
  if (loading) {
    return (
      <p className={`flex items-center gap-2 py-2 text-xs font-semibold ${WMS_INV.textMuted}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lokalizacje…
      </p>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className={`rounded-lg border ${WMS_INV.border} ${WMS_INV.surface}`}>
      <p className="border-b border-[#c5d0de] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#5a6b7d]">
        Następne lokalizacje
      </p>
      <ul>
        {items.slice(0, 8).map((t) => {
          const code = t.location_code ?? t.location_name ?? `#${t.location_id}`;
          const anomaly = t.has_variance || t.recount_flag || t.unresolved;
          return (
            <li key={t.id} className="border-b border-[#e8edf3] last:border-0">
              <button
                type="button"
                onClick={() => onSelect(t)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${WMS_INV.rowHover}`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#1a2b3c]">{code}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-[#1e4d8c]">{t.progress_percent}%</span>
                {anomaly ? <AlertTriangle className="h-4 w-4 shrink-0 text-[#b45309]" aria-label="Anomalia" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
