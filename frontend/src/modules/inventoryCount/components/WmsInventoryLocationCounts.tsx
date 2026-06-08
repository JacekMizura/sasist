import { Package } from "lucide-react";

import type { WmsCountedCarrierGroup } from "../wmsInventoryExecutionContext";
import type { WmsCountedProduct } from "../wmsInventoryExecutionContext";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  groups: WmsCountedCarrierGroup[];
  activeLineId: number | null;
  pulseLineId: number | null;
  onSelect?: (item: WmsCountedProduct) => void;
};

function ProductRow({
  item,
  activeLineId,
  pulseLineId,
  onSelect,
  indent,
}: {
  item: WmsCountedProduct;
  activeLineId: number | null;
  pulseLineId: number | null;
  onSelect?: (item: WmsCountedProduct) => void;
  indent?: boolean;
}) {
  const isActive = item.line_id === activeLineId;
  const pulse = item.line_id === pulseLineId;
  const ring = pulse
    ? "ring-1 ring-emerald-400/60"
    : isActive
      ? "ring-1 ring-[#1e4d8c]/40 bg-[#eef3fa]/60"
      : "";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left transition-all ${ring} ${indent ? "pl-4" : ""}`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Package className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold leading-tight text-slate-800">
          {item.product_name ?? item.sku ?? "—"}
        </p>
        {item.ean ? (
          <p className="truncate font-mono text-[10px] text-slate-400">EAN: {item.ean}</p>
        ) : item.sku ? (
          <p className="truncate font-mono text-[10px] text-slate-400">{item.sku}</p>
        ) : null}
      </div>
      <p className="shrink-0 text-lg font-black tabular-nums leading-none text-[#1e4d8c]">{item.counted_quantity}</p>
    </button>
  );
}

export default function WmsInventoryLocationCounts({ groups, activeLineId, pulseLineId, onSelect }: Props) {
  if (groups.length === 0) return null;

  return (
    <section>
      <p className={WMS_INV.textLabel}>Policzone w lokalizacji</p>
      <div className="mt-0.5 space-y-2">
        {groups.map((group) => (
          <div key={group.key}>
            {group.carrierId != null ? (
              <p className="mb-0.5 font-mono text-[10px] font-black uppercase tracking-wide text-[#1e4d8c]">
                └── {group.carrierCode ?? `#${group.carrierId}`}
              </p>
            ) : groups.some((g) => g.carrierId != null) ? (
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Bez nośnika</p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.line_id}>
                  <ProductRow
                    item={item}
                    activeLineId={activeLineId}
                    pulseLineId={pulseLineId}
                    onSelect={onSelect}
                    indent={group.carrierId != null}
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
