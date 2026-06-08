import { Package } from "lucide-react";

import type { WmsCountedProduct } from "../hooks/useWmsInventoryCountTerminal";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  items: WmsCountedProduct[];
  activeLineId: number | null;
  pulseLineId: number | null;
  onSelect?: (item: WmsCountedProduct) => void;
};

export default function WmsInventoryLocationCounts({ items, activeLineId, pulseLineId, onSelect }: Props) {
  if (items.length === 0) return null;

  return (
    <section>
      <p className={WMS_INV.textLabel}>Policzone w lokalizacji</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((item) => {
          const isActive = item.line_id === activeLineId;
          const pulse = item.line_id === pulseLineId;
          const ring = pulse
            ? "ring-1 ring-emerald-400/60"
            : isActive
              ? "ring-1 ring-[#1e4d8c]/40 bg-[#eef3fa]/60"
              : "";

          return (
            <li key={item.line_id}>
              <button
                type="button"
                onClick={() => onSelect?.(item)}
                className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left transition-all ${ring}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Package className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold leading-tight text-slate-800">
                    {item.product_name ?? item.sku ?? "—"}
                  </p>
                  {item.sku ? (
                    <p className="truncate font-mono text-[10px] text-slate-400">{item.sku}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-lg font-black tabular-nums leading-none text-[#1e4d8c]">
                  {item.counted_quantity}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
