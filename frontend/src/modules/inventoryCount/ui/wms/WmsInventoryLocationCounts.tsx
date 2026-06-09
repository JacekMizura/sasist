import { AlertTriangle, Image as ImageIcon } from "lucide-react";

import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import type { WmsCountedCarrierGroup, WmsCountedProduct, WmsUnexpectedProduct } from "../../wmsInventoryExecutionContext";
import { formatCartonUnitSummary } from "./inventoryQtyUtils";

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
  const summary = formatCartonUnitSummary(item.counted_quantity, pack);

  const cardBg = pulse
    ? "bg-emerald-50/80 ring-2 ring-emerald-400/50"
    : isActive
      ? "bg-indigo-50/50 ring-2 ring-indigo-200"
      : item.defectReported
        ? "bg-amber-50/40 ring-1 ring-amber-200"
        : "bg-white hover:bg-slate-50/80";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`group relative flex w-full flex-col items-center justify-between gap-4 border-b border-slate-200/60 p-5 transition-all duration-150 outline-none sm:flex-row sm:gap-6 ${cardBg}`}
    >
      <div className="flex min-w-0 w-full flex-1 items-center gap-4 text-left sm:w-auto">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              className="max-h-full max-w-full object-contain mix-blend-multiply drop-shadow-sm"
              loading="lazy"
            />
          ) : (
            <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {item.ean ? (
            <p className="mb-1.5 font-mono text-lg font-black leading-none tracking-tight text-slate-900">
              EAN: {item.ean}
            </p>
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
            <p className="mt-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Wada zgłoszona
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center justify-center sm:w-[12rem]">
        <div className="flex w-full max-w-[200px] flex-col items-center rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-3.5 group-hover:border-indigo-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#5a4fcf]">Policzono</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black leading-none tabular-nums text-[#5a4fcf]">{fmtQty(item.counted_quantity)}</span>
            <span className="text-[10px] font-bold text-[#5a4fcf]/80">szt.</span>
          </div>
          {summary ? <span className="mt-1 text-[10px] font-medium text-slate-500">{summary}</span> : null}
        </div>
      </div>
    </button>
  );
}

function UnexpectedRow({ item }: { item: WmsUnexpectedProduct }) {
  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 border-b border-slate-200/60 bg-white p-5 sm:flex-row sm:gap-6">
      <div className="flex min-w-0 w-full flex-1 items-center gap-4 text-left sm:w-auto">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 sm:h-20 sm:w-20">
          <ImageIcon size={28} className="text-slate-300" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Nieznany produkt</p>
          <h3 className="line-clamp-2 text-xs font-semibold leading-tight text-slate-700">{item.temporary_name}</h3>
          {item.barcode_value ? (
            <p className="mt-1 font-mono text-[11px] text-slate-500">Kod: {item.barcode_value}</p>
          ) : null}
        </div>
      </div>
      <div className="flex w-full shrink-0 items-center justify-center sm:w-[12rem]">
        <div className="flex w-full max-w-[200px] flex-col items-center rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-3.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#5a4fcf]">Policzono</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black leading-none tabular-nums text-[#5a4fcf]">{fmtQty(item.quantity)}</span>
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
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5">
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
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-2.5">
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
