import type { LocationVisualProduct } from "../../../api/wmsLocationVisualApi";
import { CarrierProductThumb } from "../carriers/CarrierProductThumb";

type Props = {
  products: LocationVisualProduct[];
  selectedLabel?: string | null;
  emptyHint?: string;
  occupancyPercent?: number;
};

export function LocationPreviewCarrierContents({
  products,
  selectedLabel,
  emptyHint,
  occupancyPercent = 0,
}: Props) {
  const util = Math.round(occupancyPercent);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Zawartość nośnika</p>
        <div className="flex items-center gap-2">
          {selectedLabel ? (
            <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
              {selectedLabel}
            </span>
          ) : null}
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{util}%</span>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyHint || "Brak produktów w tej lokalizacji."}</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {products.map((p) => {
            const name = (p.name || p.sku || "").trim() || `#${p.product_id}`;
            return (
              <li
                key={p.product_id}
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 transition hover:border-slate-200 hover:bg-white"
              >
                <CarrierProductThumb imageUrl={p.image_url} alt={name} size="xl" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">{name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{p.sku || "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums text-slate-900">{p.quantity}</p>
                  <p className="text-[10px] text-slate-500">szt.</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
