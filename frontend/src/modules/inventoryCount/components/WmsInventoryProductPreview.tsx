import { Package } from "lucide-react";

import type { WmsBarcodeResolveResult } from "../../../api/inventoryCountApi";

type Props = {
  scan: WmsBarcodeResolveResult | null;
  pulse?: boolean;
};

export default function WmsInventoryProductPreview({ scan, pulse }: Props) {
  if (!scan) return null;

  const qty = scan.counted_quantity ?? 0;

  return (
    <div
      className={`flex flex-col items-center px-2 py-6 transition-transform duration-200 ${
        pulse ? "scale-[1.02]" : "scale-100"
      }`}
    >
      <div className="mb-4 flex h-40 w-40 items-center justify-center">
        {scan.image_url ? (
          <img src={scan.image_url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Package className="h-16 w-16 text-[#c5d0de]" strokeWidth={1.25} />
        )}
      </div>
      <h2 className="max-w-md text-center text-xl font-bold leading-snug text-[#1a2b3c]">
        {scan.product_name ?? "—"}
      </h2>
      <p className="mt-2 font-mono text-sm text-[#5a6b7d]">{scan.ean ?? scan.barcode ?? "—"}</p>
      <p className="font-mono text-sm text-[#5a6b7d]">{scan.sku ?? "—"}</p>
      <p
        key={qty}
        className="mt-5 text-5xl font-black tabular-nums text-[#1e4d8c] transition-transform duration-200"
      >
        {qty}
      </p>
    </div>
  );
}
