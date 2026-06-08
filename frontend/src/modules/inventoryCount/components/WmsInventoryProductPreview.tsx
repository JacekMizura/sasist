import { Package } from "lucide-react";

import type { WmsBarcodeResolveResult } from "../../../api/inventoryCountApi";

type Props = {
  scan: WmsBarcodeResolveResult | null;
  pulse?: boolean;
  invalid?: boolean;
};

export default function WmsInventoryProductPreview({ scan, pulse, invalid }: Props) {
  if (!scan) {
    return (
      <div className="flex min-h-[72px] items-center justify-center py-2 text-sm text-[#8a9bb0]">
        Ostatni skan pojawi się tutaj
      </div>
    );
  }

  const qty = scan.counted_quantity ?? 0;
  const ring = invalid ? "ring-2 ring-[#b42318]/50" : pulse ? "ring-2 ring-[#1a7f4b]/40" : "";

  return (
    <div className={`flex items-center gap-3 rounded-lg px-1 py-2 transition-all ${ring}`}>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center">
        {scan.image_url ? (
          <img src={scan.image_url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Package className="h-8 w-8 text-[#c5d0de]" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight text-[#1a2b3c]">{scan.product_name ?? "—"}</p>
        <p className="truncate font-mono text-xs text-[#5a6b7d]">{scan.ean ?? scan.barcode ?? "—"}</p>
        <p className="truncate font-mono text-xs text-[#5a6b7d]">{scan.sku ?? "—"}</p>
      </div>
      <p key={qty} className="shrink-0 text-3xl font-black tabular-nums text-[#1e4d8c]">
        {qty}
      </p>
    </div>
  );
}
