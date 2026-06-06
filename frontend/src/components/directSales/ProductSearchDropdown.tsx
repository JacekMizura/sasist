import { CornerDownLeft, Image as ImageIcon } from "lucide-react";
import { formatDirectSalesUnitPrice } from "../../modules/directSales/settings/formatDirectSalesPrice";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";
import type { DirectSaleProductSearchHit } from "../../utils/normalizeDirectSales";

type Props = {
  hits: DirectSaleProductSearchHit[];
  activeIndex: number;
  onPick: (hit: DirectSaleProductSearchHit) => void;
};

function HitRow({
  hit,
  active,
  onPick,
}: {
  hit: DirectSaleProductSearchHit;
  active: boolean;
  onPick: () => void;
}) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const meta: string[] = [];
  
  if (resolvedDirectSalesSettings.show_sku && hit.sku) meta.push(hit.sku);
  if (resolvedDirectSalesSettings.show_ean && hit.ean) meta.push(`EAN ${hit.ean}`);
  if (resolvedDirectSalesSettings.show_catalog_number && hit.catalog_number) {
    meta.push(`kat. ${hit.catalog_number}`);
  }

  const priceLabel =
    hit.unit_price != null
      ? formatDirectSalesUnitPrice(hit.unit_price, resolvedDirectSalesSettings.price_display)
      : null;

  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full px-4 py-3 flex items-start gap-4 border-b border-blue-50/50 transition-colors group text-left last:border-0 ${
        active ? "bg-blue-50" : "bg-white hover:bg-blue-50/50"
      }`}
    >
      {/* Miniatura / Placeholder */}
      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
        {resolvedDirectSalesSettings.show_product_images && hit.image_url ? (
          <img src={hit.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={20} className="text-slate-300" />
        )}
      </div>

      {/* Informacje o produkcie */}
      <div className="flex-1 min-w-0 pt-0.5">
        <h4 className="font-bold text-sm text-slate-900 truncate">{hit.name}</h4>
        
        {meta.length ? (
          <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
            {meta.join(" • ")}
          </p>
        ) : null}
        
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {hit.preferred_location_code ? (
            <span className="bg-blue-50 border border-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide shadow-sm">
              {hit.preferred_location_code}
            </span>
          ) : null}
          
          {resolvedDirectSalesSettings.show_stock ? (
            <span className="text-[11px] font-medium text-slate-500">
              dostępne: <span className="font-bold text-slate-700">{hit.available_qty}</span>
            </span>
          ) : null}

          {priceLabel ? (
            <span className="text-xs font-bold text-slate-800 ml-auto">
              {priceLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* Akcja Enter */}
      <div className="pt-2 flex-shrink-0">
        <div
          className={`flex items-center gap-1 text-blue-600 font-bold text-xs transition-opacity ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          Enter <CornerDownLeft size={14} />
        </div>
      </div>
    </button>
  );
}

export function ProductSearchDropdown({ hits, activeIndex, onPick }: Props) {
  if (!hits.length) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm font-medium text-slate-500">
          Brak wyników — <span className="font-bold text-blue-600">Enter</span> dodaje po kodzie.
        </p>
      </div>
    );
  }
  
  return (
    <div className="overflow-y-auto custom-scrollbar">
      {hits.map((hit, i) => (
        <HitRow 
          key={hit.product_id} 
          hit={hit} 
          active={i === activeIndex} 
          onPick={() => onPick(hit)} 
        />
      ))}
    </div>
  );
}