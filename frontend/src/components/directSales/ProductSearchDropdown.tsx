import { safeDisplay } from "../../utils/safeStrings";
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
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-sky-50 ${
        active ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""
      }`}
    >
      {hit.image_url ? (
        <img src={hit.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
          brak
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-900">{hit.name}</div>
        <div className="truncate text-xs text-slate-500">
          {safeDisplay(hit.sku, "—")} · EAN {safeDisplay(hit.ean, "—")}
          {hit.catalog_number ? ` · kat. ${hit.catalog_number}` : ""}
        </div>
        <div className="text-xs text-slate-600">
          dostępne: {hit.available_qty}
          {hit.preferred_location_code ? ` · ${hit.preferred_location_code}` : ""}
          {hit.unit_price != null ? ` · ${hit.unit_price.toFixed(2)} zł` : ""}
        </div>
      </div>
      <span className="shrink-0 text-xs font-semibold text-sky-700">Enter</span>
    </button>
  );
}

export function ProductSearchDropdown({ hits, activeIndex, onPick }: Props) {
  if (!hits.length) {
    return <p className="p-3 text-sm text-slate-500">Brak wyników — Enter dodaje po kodzie.</p>;
  }
  return (
    <>
      {hits.map((hit, i) => (
        <HitRow key={hit.product_id} hit={hit} active={i === activeIndex} onPick={() => onPick(hit)} />
      ))}
    </>
  );
}
