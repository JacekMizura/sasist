import { AlertTriangle, Image as ImageIcon } from "lucide-react";

import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import type { WmsCountedCarrierGroup, WmsCountedProduct, WmsUnexpectedProduct } from "../../wmsInventoryExecutionContext";
import { formatPackagingHelper } from "./inventoryQtyUtils";

type Props = {
  groups: WmsCountedCarrierGroup[];
  unexpectedItems: WmsUnexpectedProduct[];
  activeLineId: number | null;
  pulseLineId: number | null;
  unitsPerCarton?: number;
  onSelect?: (item: WmsCountedProduct) => void;
};

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

function ProductRow({
  item,
  activeLineId,
  pulseLineId,
  unitsPerCarton,
  onSelect,
}: {
  item: WmsCountedProduct;
  activeLineId: number | null;
  pulseLineId: number | null;
  unitsPerCarton?: number;
  onSelect?: (item: WmsCountedProduct) => void;
}) {
  const isActive = item.line_id === activeLineId;
  const pulse = item.line_id === pulseLineId;
  const pack = Math.max(1, unitsPerCarton ?? 1);
  const hint = formatPackagingHelper(item.counted_quantity, pack);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`group flex w-full flex-col items-center justify-between gap-4 border-b border-slate-200/60 p-4 transition-colors outline-none sm:flex-row sm:gap-6 ${
        pulse ? "bg-emerald-50/60" : isActive ? "bg-slate-50" : "bg-white hover:bg-slate-50/80"
      }`}
    >
      <div className="flex min-w-0 w-full flex-1 items-center gap-4 text-left sm:w-auto">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              className="max-h-full max-w-full object-contain mix-blend-multiply"
              loading="lazy"
            />
          ) : (
            <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {item.ean ? (
            <p className="mb-1 font-mono text-lg font-black leading-none text-slate-900">EAN: {item.ean}</p>
          ) : null}
          <h3 className="line-clamp-2 text-xs font-semibold leading-tight text-slate-500 group-hover:text-[#5a4fcf]">
            {item.product_name ?? item.sku ?? "—"}
          </h3>
          {item.carrier_code ? (
            <div className="mt-2">
              <CarrierBadge code={item.carrier_code} />
            </div>
          ) : null}
          {item.defectReported ? (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] font-black uppercase text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Wada
            </p>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="inline-flex flex-col items-end rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#5a4fcf]">Ilość</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tabular-nums leading-none text-[#5a4fcf]">{fmtQty(item.counted_quantity)}</span>
            <span className="text-[10px] font-bold text-[#5a4fcf]/80">szt.</span>
          </div>
          {hint ? <span className="mt-0.5 text-[10px] font-normal text-slate-400">{hint}</span> : null}
        </div>
      </div>
    </button>
  );
}

function UnexpectedRow({ item }: { item: WmsUnexpectedProduct }) {
  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 border-b border-slate-200/60 bg-white p-4 sm:flex-row sm:gap-6">
      <div className="flex min-w-0 w-full flex-1 items-center gap-4 text-left sm:w-auto">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 sm:h-20 sm:w-20">
          <ImageIcon size={28} className="text-slate-300" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Nieznany produkt</p>
          <h3 className="line-clamp-2 text-xs font-semibold text-slate-700">{item.temporary_name}</h3>
          {item.barcode_value ? (
            <p className="mt-1 font-mono text-[11px] text-slate-500">{item.barcode_value}</p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="inline-flex flex-col items-end rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#5a4fcf]">Ilość</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tabular-nums leading-none text-[#5a4fcf]">{fmtQty(item.quantity)}</span>
            <span className="text-[10px] font-bold text-[#5a4fcf]/80">szt.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WmsInventoryLocationCounts({
  groups,
  unexpectedItems,
  activeLineId,
  pulseLineId,
  unitsPerCarton,
  onSelect,
}: Props) {
  if (groups.length === 0 && unexpectedItems.length === 0) return null;

  const hasCarriers = groups.some((g) => g.carrierId != null);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      {groups.map((group) => (
        <div key={group.key}>
          {hasCarriers ? (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2">
              {group.carrierId != null && group.carrierCode ? (
                <CarrierBadge code={group.carrierCode} />
              ) : (
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Luzem</span>
              )}
            </div>
          ) : null}
          <ul>
            {group.items.map((item) => (
              <li key={item.line_id}>
                <ProductRow
                  item={item}
                  activeLineId={activeLineId}
                  pulseLineId={pulseLineId}
                  unitsPerCarton={unitsPerCarton}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {unexpectedItems.length > 0 ? (
        <div>
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nieznane produkty</span>
          </div>
          <ul>
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
