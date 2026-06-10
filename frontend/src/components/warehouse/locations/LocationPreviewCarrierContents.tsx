import type { LocationVisualProduct } from "../../../api/wmsLocationVisualApi";
import { CarrierProductThumb } from "../carriers/CarrierProductThumb";

type Props = {
  products: LocationVisualProduct[];
  selectedLabel?: string | null;
  emptyHint?: string;
};

export function LocationPreviewCarrierContents({ products, selectedLabel, emptyHint }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Zawartość nośnika</p>
        {selectedLabel ? (
          <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
            {selectedLabel}
          </span>
        ) : null}
      </div>

      {products.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyHint || "Brak produktów w tej lokalizacji."}</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {products.map((p) => {
            const name = (p.name || p.sku || "").trim() || `#${p.product_id}`;
            return (
              <li
                key={p.product_id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50/80 to-white p-2.5 shadow-sm transition hover:border-slate-200 hover:shadow-md"
              >
                <CarrierProductThumb imageUrl={p.image_url} alt={name} size="xl" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-500">{p.sku || "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-black tabular-nums text-slate-900">{p.quantity}</p>
                  <p className="text-[10px] font-medium text-slate-500">szt.</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
