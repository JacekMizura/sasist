import { Boxes, MapPin, Package2 } from "lucide-react";

import type { WmsCountedCarrierGroup } from "../../wmsInventoryExecutionContext";
import type { WmsCountedProduct } from "../../wmsInventoryExecutionContext";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
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
    ? "ring-2 ring-emerald-400/70"
    : isActive
      ? "ring-1 ring-[#1e4d8c]/50 bg-white"
      : "bg-white/80";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`flex w-full items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-left transition-all ${ring}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-50">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold leading-tight text-slate-900">
          {item.product_name ?? item.sku ?? "—"}
        </p>
        {item.ean ? (
          <p className="truncate font-mono text-[10px] text-slate-500">EAN {item.ean}</p>
        ) : item.sku ? (
          <p className="truncate font-mono text-[10px] text-slate-500">{item.sku}</p>
        ) : null}
      </div>
      <p className="shrink-0 text-xl font-black tabular-nums leading-none text-[#1e4d8c]">{item.counted_quantity}</p>
    </button>
  );
}

export default function WmsInventoryLocationCounts({
  groups,
  locationCode,
  activeLineId,
  pulseLineId,
  onSelect,
}: Props) {
  if (groups.length === 0) return null;

  const hasCarriers = groups.some((g) => g.carrierId != null);

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
      <div className="mb-2 flex items-center gap-2 border-b border-slate-200/80 pb-2">
        <MapPin className="h-4 w-4 text-slate-500" strokeWidth={2} />
        <div>
          <p className={WMS_INV.textLabel}>Lokalizacja</p>
          {locationCode ? (
            <LocationBadge code={locationCode} type="PICK" />
          ) : (
            <span className="text-xs font-bold text-slate-700">—</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.key}>
            {hasCarriers ? (
              <div
                className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 ${
                  group.carrierId != null
                    ? "border border-[#1e4d8c]/25 bg-[#1e4d8c]/10"
                    : "border border-dashed border-slate-300 bg-white"
                }`}
              >
                <Boxes
                  className={`h-5 w-5 shrink-0 ${group.carrierId != null ? "text-[#1e4d8c]" : "text-slate-400"}`}
                  strokeWidth={2}
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Nośnik</p>
                  <p className="font-mono text-sm font-black text-[#1e4d8c]">
                    {group.carrierCode ?? (group.carrierId != null ? `#${group.carrierId}` : "Bez nośnika")}
                  </p>
                </div>
              </div>
            ) : null}

            <ul className={`space-y-1 ${hasCarriers ? "ml-3 border-l-2 border-[#1e4d8c]/20 pl-2" : ""}`}>
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
      </div>
    </section>
  );
}
