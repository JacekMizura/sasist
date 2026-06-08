import { Package } from "lucide-react";

import type { WmsLastScanEntry } from "../hooks/useWmsInventoryCountTerminal";

type Props = {
  items: WmsLastScanEntry[];
};

export default function WmsInventoryLastScans({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="shrink-0">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">Ostatnie skany</p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <li
            key={item.at}
            className="flex shrink-0 items-center gap-2 rounded-md border border-[#e2e6ec] bg-white px-2 py-1.5"
          >
            <div className="flex h-8 w-8 items-center justify-center">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Package className="h-4 w-4 text-[#c5d0de]" />
              )}
            </div>
            <div className="max-w-[120px]">
              <p className="truncate text-xs font-semibold text-[#1a2b3c]">{item.product_name ?? item.sku ?? "—"}</p>
              <p className="text-xs font-bold tabular-nums text-[#1e4d8c]">
                {item.delta > 0 ? `+${item.delta}` : item.delta}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
