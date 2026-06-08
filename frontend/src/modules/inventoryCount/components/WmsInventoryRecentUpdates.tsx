import type { WmsCountedProduct } from "../hooks/useWmsInventoryCountTerminal";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  items: WmsCountedProduct[];
  pulseLineId: number | null;
};

const MAX_VISIBLE = 5;

/** Compact recently-updated rows — deduplicated by line_id, not an activity feed. */
export default function WmsInventoryRecentUpdates({ items, pulseLineId }: Props) {
  if (items.length === 0) return null;

  return (
    <section>
      <p className={WMS_INV.textLabel}>Ostatnio aktualizowane</p>
      <ul className="mt-0.5 space-y-0">
        {items.slice(0, MAX_VISIBLE).map((item) => {
          const pulse = item.line_id === pulseLineId;
          return (
            <li
              key={item.line_id}
              className={`flex items-baseline justify-between gap-2 py-0.5 text-[11px] transition-colors ${
                pulse ? "text-emerald-700" : "text-slate-700"
              }`}
            >
              <span className="min-w-0 truncate font-bold">{item.product_name ?? item.sku ?? "—"}</span>
              <span className="shrink-0 font-black tabular-nums text-[#1e4d8c]">{item.counted_quantity}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
