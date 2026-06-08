import { Package } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";

type Props = {
  scan: WmsBarcodeResolveResult | null;
  pulse?: boolean;
  invalid?: boolean;
};

export default function WmsInventoryProductPreview({ scan, pulse, invalid }: Props) {
  if (!scan) return null;

  const qty = scan.counted_quantity ?? 0;
  const ring = invalid ? "ring-1 ring-red-400/70" : pulse ? "ring-1 ring-emerald-400/60" : "";

  return (
    <div className={`${ring} transition-all`}>
      <div className="flex gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          {scan.image_url ? (
            <img src={scan.image_url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <Package className="h-5 w-5 text-slate-300" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black leading-tight text-slate-900">{scan.product_name ?? "—"}</p>
          <p className="truncate font-mono text-[11px] text-slate-500">{scan.ean ?? scan.barcode ?? "—"}</p>
          <p className="truncate font-mono text-[11px] text-slate-500">{scan.sku ?? "—"}</p>
        </div>
      </div>
      <p key={qty} className="mt-0.5 text-right text-2xl font-black tabular-nums leading-none text-[#1e4d8c]">
        {qty}
      </p>
    </div>
  );
}
