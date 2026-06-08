import { Package } from "lucide-react";

import type { WmsLastScanEntry } from "../hooks/useWmsInventoryCountTerminal";

type Props = {
  items: WmsLastScanEntry[];
};

const MAX_VISIBLE = 4;

export default function WmsInventoryLastScans({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="shrink-0">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">Ostatnie skany</p>
      <ul className="flex gap-2 overflow-x-auto pb-0.5">
        {items.slice(0, MAX_VISIBLE).map((item) => (
          <li
            key={item.at}
            className="flex min-w-[148px] max-w-[200px] shrink-0 items-center gap-2 py-0.5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Package className="h-5 w-5 text-[#c5d0de]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-semibold leading-tight text-[#1a2b3c]">
                {item.product_name ?? item.sku ?? "—"}
              </p>
              <p className="text-sm font-black tabular-nums text-[#1e4d8c]">
                {item.delta > 0 ? `+${item.delta}` : item.delta}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
