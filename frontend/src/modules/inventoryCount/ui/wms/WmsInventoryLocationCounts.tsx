import { AlertTriangle, Package } from "lucide-react";

import type { WmsCountedCarrierGroup, WmsCountedProduct, WmsUnexpectedProduct } from "../../wmsInventoryExecutionContext";
import WmsInventoryProductThumb from "./WmsInventoryProductThumb";
import { WMS_INV } from "./theme";

type Props = {
  groups: WmsCountedCarrierGroup[];
  unexpectedItems: WmsUnexpectedProduct[];
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
      : item.defectReported
        ? "ring-2 ring-amber-300/80 border-amber-200"
        : "border-slate-200";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`${WMS_INV.card} flex w-full items-center justify-between gap-4 p-4 text-left transition-all ${ring}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <WmsInventoryProductThumb url={item.image_url} name={item.product_name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{item.product_name ?? item.sku ?? "—"}</p>
          {item.ean ? (
            <p className="mt-0.5 text-[11px] text-slate-500">EAN {item.ean}</p>
          ) : item.sku ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{item.sku}</p>
          ) : null}
          {item.defectReported ? (
            <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Wada zgłoszona
            </p>
          ) : null}
        </div>
      </div>
      <p className="shrink-0 text-3xl font-bold tabular-nums leading-none text-[#23438e]">{item.counted_quantity}</p>
    </button>
  );
}

function UnexpectedRow({ item }: { item: WmsUnexpectedProduct }) {
  return (
    <div className={`${WMS_INV.card} flex w-full items-center justify-between gap-4 border-dashed p-4`}>
      <div className="flex min-w-0 items-center gap-4">
        <WmsInventoryProductThumb url={null} name={item.temporary_name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{item.temporary_name}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Produkt spoza systemu</p>
          {item.barcode_value ? (
            <p className="mt-0.5 text-[11px] text-slate-500">Kod: {item.barcode_value}</p>
          ) : null}
        </div>
      </div>
      <p className="shrink-0 text-3xl font-bold tabular-nums leading-none text-amber-700">{item.quantity}</p>
    </div>
  );
}

export default function WmsInventoryLocationCounts({
  groups,
  unexpectedItems,
  activeLineId,
  pulseLineId,
  onSelect,
}: Props) {
  if (groups.length === 0 && unexpectedItems.length === 0) return null;

  const hasCarriers = groups.some((g) => g.carrierId != null);

  return (
    <section className="space-y-3">
      {groups.map((group) => (
        <div key={group.key} className="space-y-3">
          {hasCarriers ? (
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest ${
                group.carrierId != null
                  ? "border border-slate-200 bg-white text-[#23438e]"
                  : "border border-dashed border-slate-200 text-slate-400"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              {group.carrierCode ?? (group.carrierId != null ? `NOŚNIK #${group.carrierId}` : "Luzem (bez nośnika)")}
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

      {unexpectedItems.length > 0 ? (
        <div className="space-y-3">
          <p className={WMS_INV.textLabel}>Nieznane produkty</p>
          <ul className="space-y-3">
            {unexpectedItems.map((item) => (
              <li key={item.unknown_id}>
                <UnexpectedRow item={item} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
