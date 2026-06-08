import type { WmsRecentScanEntry } from "@/api/inventoryCountApi";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  items: WmsRecentScanEntry[];
};

export default function WmsInventoryRecentScans({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className={`rounded-lg border ${WMS_INV.border} ${WMS_INV.surface} p-3`}>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-[#5a6b7d]">Ostatnie skany</h3>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={`${item.line_id}-${item.scanned_at}-${idx}`}
            className="flex items-center gap-3 rounded-lg border border-[#e8edf3] bg-[#fafbfc] px-2 py-2"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-[#c5d0de] bg-white">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[10px] font-bold text-[#8a9bb0]">—</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#1a2b3c]">{item.product_name ?? item.sku ?? "—"}</p>
              <p className="truncate font-mono text-[10px] text-[#5a6b7d]">{item.ean ?? item.barcode}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-black tabular-nums text-[#1e4d8c]">
                {item.scan_delta != null && item.scan_delta > 0 ? `+${item.scan_delta}` : item.counted_quantity}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
