import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { LocationVisualOccupancy, LocationVisualProduct } from "../../../api/wmsLocationVisualApi";
import { DamageDispositionBadge } from "../../inventory/DamageDispositionBadge";
import { CarrierProductThumb } from "../carriers/CarrierProductThumb";

type Props = {
  products: LocationVisualProduct[];
  selectedLabel?: string | null;
  emptyHint?: string;
  occupancy?: LocationVisualOccupancy | null;
  tenantId?: number | null;
  className?: string;
};

function OccupancyBadge({ occupancy }: { occupancy?: LocationVisualOccupancy | null }) {
  const basis = occupancy?.capacity_basis ?? "none";
  const percent = occupancy?.capacity_utilization_percent;
  const label = (occupancy?.capacity_label || "").trim();

  if (basis === "none" || percent == null || !Number.isFinite(percent)) {
    const hint =
      label === "Brak danych o objętości produktów"
        ? "Brak danych o objętości produktów."
        : label || "Brak danych o pojemności nośnika";
    return (
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-500">— %</p>
        <p className="max-w-[12rem] text-[10px] leading-snug text-slate-500">{hint}</p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-sm font-semibold tabular-nums text-slate-800">{Math.round(percent)}%</p>
      {label ? <p className="max-w-[12rem] text-[10px] leading-snug text-slate-500">{label}</p> : null}
    </div>
  );
}

export function LocationPreviewCarrierContents({
  products,
  selectedLabel,
  emptyHint,
  occupancy,
  tenantId,
  className = "",
}: Props) {
  const navigate = useNavigate();

  /** Pełna karta produktu z katalogu (jak „Edytuj” na liście) — nie uproszczony `/products/:id`. */
  const openProduct = (productId: number) => {
    if (productId < 1) return;
    navigate(`/products/${productId}/edit`, {
      state: tenantId != null && tenantId >= 1 ? { tenantId } : undefined,
    });
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Zawartość nośnika</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Zajętość nośnika</p>
          {selectedLabel ? (
            <span className="mt-1 inline-block max-w-full truncate rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
              {selectedLabel}
            </span>
          ) : null}
        </div>
        <OccupancyBadge occupancy={occupancy} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
        {products.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{emptyHint || "Brak produktów w tej lokalizacji."}</p>
        ) : (
          <ul className="space-y-2">
            {products.map((p) => {
              const name = (p.name || p.sku || "").trim() || `#${p.product_id}`;
              const rowKey = p.row_key || String(p.product_id);
              const ean = (p.ean || "").trim();
              return (
                <li key={rowKey}>
                  <button
                    type="button"
                    onClick={() => openProduct(p.product_id)}
                    className="group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                  >
                    <CarrierProductThumb imageUrl={p.image_url} alt={name} size="xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{name}</p>
                        <DamageDispositionBadge
                          stockDisposition={p.stock_disposition}
                          damageClass={p.damage_class}
                          dispositionBadge={p.disposition_badge}
                          damageTrace={p.damage_trace}
                        />
                      </div>
                      <dl className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                        <div className="flex gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">SKU</dt>
                          <dd className="min-w-0 truncate font-mono text-slate-800">{p.sku?.trim() || "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">EAN</dt>
                          <dd className="min-w-0 truncate font-mono text-slate-800">{ean || "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">Ilość</dt>
                          <dd className="font-semibold tabular-nums text-slate-900">{p.quantity} szt.</dd>
                        </div>
                      </dl>
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 opacity-80 group-hover:opacity-100">
                        <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                        Otwórz kartę produktu
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
