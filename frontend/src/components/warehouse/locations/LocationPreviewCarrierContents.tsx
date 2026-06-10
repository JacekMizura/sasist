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
    <div className="flex h-full min-h-0 flex-col rounded-md border border-slate-700/50 bg-[#0f1520]/90 p-3 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-200">Zawartość</p>
        <div className="flex items-center gap-2">
          {selectedLabel ? (
            <span className="truncate rounded bg-[#080c12] px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400/90">
              {selectedLabel}
            </span>
          ) : null}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              util >= 80 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {util}%
          </span>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyHint || "Brak produktów w tej lokalizacji."}</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {products.map((p) => {
            const name = (p.name || p.sku || "").trim() || `#${p.product_id}`;
            return (
              <li
                key={p.product_id}
                className="flex items-center gap-2.5 rounded-md border border-slate-700/40 bg-[#080c12]/60 p-2 transition hover:border-slate-600/60 hover:bg-[#0c1018]"
              >
                <CarrierProductThumb imageUrl={p.image_url} alt={name} size="xl" className="rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">{name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-500">{p.sku || "—"}</p>
                </div>
                <div className="shrink-0 rounded-md bg-cyan-500/10 px-2 py-1 text-right">
                  <p className="text-lg font-black tabular-nums text-cyan-300">{p.quantity}</p>
                  <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">szt</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
