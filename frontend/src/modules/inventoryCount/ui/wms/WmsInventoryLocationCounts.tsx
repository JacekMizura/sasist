import { AlertTriangle, Image as ImageIcon } from "lucide-react";

import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import type { WmsCountedCarrierGroup, WmsCountedProduct, WmsUnexpectedProduct } from "../../wmsInventoryExecutionContext";
import { piecesToCartonUnit } from "./inventoryQtyUtils";

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
  const { cartons, units } = piecesToCartonUnit(item.counted_quantity, pack);
  const showSplit = pack > 1 && (cartons > 0 || units > 0);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`group flex w-full items-center gap-3 border-b border-slate-200/60 px-3 py-2.5 text-left transition-colors outline-none sm:gap-4 ${
        pulse ? "bg-emerald-50/70" : isActive ? "bg-slate-100/80" : "bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="max-h-full max-w-full object-contain mix-blend-multiply"
            loading="lazy"
          />
        ) : (
          <ImageIcon size={22} className="text-slate-200" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">{item.product_name ?? item.sku ?? "—"}</h3>
        {item.ean ? <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">EAN {item.ean}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {item.carrier_code ? <CarrierBadge code={item.carrier_code} /> : null}
          {item.defectReported ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Wada
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {showSplit ? (
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <span className="tabular-nums text-slate-700">{fmtQty(cartons)}</span> krt ·{" "}
            <span className="tabular-nums text-slate-700">{fmtQty(units)}</span> szt
          </div>
        ) : null}
        <div className="text-lg font-black tabular-nums text-slate-900">
          {fmtQty(item.counted_quantity)} <span className="text-[10px] font-bold text-slate-500">szt.</span>
        </div>
      </div>
    </button>
  );
}

function UnexpectedRow({ item }: { item: WmsUnexpectedProduct }) {
  return (
    <div className="flex w-full items-center gap-3 border-b border-slate-200/60 px-3 py-2.5 sm:gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 sm:h-14 sm:w-14">
        <ImageIcon size={22} className="text-slate-300" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nieznany produkt</p>
        <h3 className="line-clamp-2 text-sm font-bold text-slate-800">{item.temporary_name}</h3>
        {item.barcode_value ? <p className="mt-0.5 font-mono text-[11px] text-slate-500">{item.barcode_value}</p> : null}
      </div>
      <div className="shrink-0 text-lg font-black tabular-nums text-slate-900">
        {fmtQty(item.quantity)} <span className="text-[10px] font-bold text-slate-500">szt.</span>
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
  const pack = Math.max(1, unitsPerCarton ?? 1);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Policzone w lokalizacji</p>
      </div>

      {groups.map((group) => (
        <div key={group.key}>
          {hasCarriers ? (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-1.5">
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
                  unitsPerCarton={pack}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {unexpectedItems.length > 0 ? (
        <div>
          <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-1.5">
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
