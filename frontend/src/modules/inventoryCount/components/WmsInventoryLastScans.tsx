import { Package } from "lucide-react";

import type { WmsLastScanEntry } from "../hooks/useWmsInventoryCountTerminal";

type Props = {
  items: WmsLastScanEntry[];
};

const MAX_VISIBLE = 4;

export default function WmsInventoryLastScans({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section>
      <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Ostatnie skany
      </p>
      <ul className="flex gap-1.5 overflow-x-auto">
        {items.slice(0, MAX_VISIBLE).map((item) => (
          <li
            key={item.at}
            className="flex min-w-[108px] max-w-[140px] shrink-0 items-center gap-1.5 py-0.5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Package className="h-4 w-4 text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold leading-tight text-slate-800">
                {item.product_name ?? item.sku ?? "—"}
              </p>
              <p className="text-xs font-black tabular-nums text-[#1e4d8c]">
                {item.delta > 0 ? `+${item.delta}` : item.delta}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
