import { Package } from "lucide-react";

import type { WmsBarcodeResolveResult } from "../../../api/inventoryCountApi";

type Props = {
  scan: WmsBarcodeResolveResult | null;
  pulse?: boolean;
  invalid?: boolean;
};

export default function WmsInventoryProductPreview({ scan, pulse, invalid }: Props) {
  if (!scan) return null;

  const qty = scan.counted_quantity ?? 0;
  const ring = invalid ? "ring-1 ring-[#b42318]/60" : pulse ? "ring-1 ring-[#1a7f4b]/50" : "";

  return (
    <div className={`grid grid-cols-[56px_1fr_auto] gap-x-2.5 gap-y-0.5 py-1 transition-all ${ring}`}>
      <div className="row-span-3 flex items-center justify-center">
        {scan.image_url ? (
          <img src={scan.image_url} alt="" className="h-14 w-14 object-contain" />
        ) : (
          <Package className="h-8 w-8 text-[#c5d0de]" strokeWidth={1.5} />
        )}
      </div>
      <div className="col-span-2 flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-bold leading-snug text-[#1a2b3c]">
          {scan.product_name ?? "—"}
        </p>
        <p key={qty} className="shrink-0 text-3xl font-black tabular-nums leading-none text-[#1e4d8c]">
          {qty}
        </p>
      </div>
      <p className="col-span-2 truncate font-mono text-xs text-[#5a6b7d]">{scan.ean ?? scan.barcode ?? "—"}</p>
      <p className="col-span-2 truncate font-mono text-xs text-[#5a6b7d]">{scan.sku ?? "—"}</p>
    </div>
  );
}
