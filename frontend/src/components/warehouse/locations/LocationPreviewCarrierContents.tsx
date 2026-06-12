import type { LocationVisualProduct } from "../../../api/wmsLocationVisualApi";
import { DamageDispositionBadge } from "../../inventory/DamageDispositionBadge";
import { CarrierProductThumb } from "../carriers/CarrierProductThumb";

type Props = {
  products: LocationVisualProduct[];
  selectedLabel?: string | null;
  emptyHint?: string;
  occupancyPercent?: number;
  className?: string;
};

export function LocationPreviewCarrierContents({
  products,
  selectedLabel,
  emptyHint,
  occupancyPercent = 0,
  className = "",
}: Props) {
  const util = Math.round(occupancyPercent);

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-900">Zawartość nośnika</p>
        <div className="flex items-center gap-2">
          {selectedLabel ? (
            <span className="max-w-[8rem] truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
              {selectedLabel}
            </span>
          ) : null}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {util}%
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {products.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{emptyHint || "Brak produktów w tej lokalizacji."}</p>
        ) : (
          <ul className="space-y-2">
            {products.map((p) => {
              const name = (p.name || p.sku || "").trim() || `#${p.product_id}`;
              const rowKey = p.row_key || String(p.product_id);
              return (
                <li
                  key={rowKey}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <CarrierProductThumb imageUrl={p.image_url} alt={name} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">{name}</p>
                      <DamageDispositionBadge
                        stockDisposition={p.stock_disposition}
                        damageClass={p.damage_class}
                        dispositionBadge={p.disposition_badge}
                        damageTrace={p.damage_trace}
                      />
                    </div>
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
    </div>
  );
}
