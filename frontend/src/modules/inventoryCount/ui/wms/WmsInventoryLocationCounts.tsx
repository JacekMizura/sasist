import { Package } from "lucide-react";

import type { WmsCountedCarrierGroup } from "../../wmsInventoryExecutionContext";
import type { WmsCountedProduct } from "../../wmsInventoryExecutionContext";
import { WMS_INV } from "./theme";

type Props = {
  groups: WmsCountedCarrierGroup[];
  locationCode: string | null;
  activeLineId: number | null;
  pulseLineId: number | null;
  onSelect?: (item: WmsCountedProduct) => void;
};

function ProductRow({
  item,
  activeLineId,
  pulseLineId,
  onSelect,
}: {
  item: WmsCountedProduct;
  activeLineId: number | null;
  pulseLineId: number | null;
  onSelect?: (item: WmsCountedProduct) => void;
}) {
  const isActive = item.line_id === activeLineId;
  const pulse = item.line_id === pulseLineId;
  const ring = pulse
    ? "ring-2 ring-emerald-400/60"
    : isActive
      ? "ring-2 ring-[#5a45d0]/30 border-[#5a45d0]/40"
      : "border-slate-200";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`${WMS_INV.card} flex w-full items-center justify-between p-5 text-left transition-all ${ring}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-100 bg-white">
          {item.image_url ? (
            <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <Package className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{item.product_name ?? item.sku ?? "—"}</p>
          {item.ean ? (
            <p className="mt-0.5 text-[11px] text-slate-500">EAN {item.ean}</p>
          ) : item.sku ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{item.sku}</p>
          ) : null}
        </div>
      </div>
      <p className="shrink-0 text-3xl font-bold tabular-nums leading-none text-[#23438e]">{item.counted_quantity}</p>
    </button>
  );
}

export default function WmsInventoryLocationCounts({
  groups,
  activeLineId,
  pulseLineId,
  onSelect,
}: Props) {
  if (groups.length === 0) return null;

  const hasCarriers = groups.some((g) => g.carrierId != null);

  return (
    <section className="space-y-3">
      {groups.map((group) => (
        <div key={group.key} className="space-y-3">
          {hasCarriers ? (
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest ${
                group.carrierId != null
                  ? "border border-[#d6defc] bg-[#eff2fe] text-[#5a45d0]"
                  : "border border-dashed border-slate-200 text-slate-400"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              {group.carrierCode ?? (group.carrierId != null ? `#${group.carrierId}` : "Bez nośnika")}
            </div>
          ) : null}

          <ul className="space-y-3">
            {group.items.map((item) => (
              <li key={item.line_id}>
                <ProductRow
                  item={item}
                  activeLineId={activeLineId}
                  pulseLineId={pulseLineId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
