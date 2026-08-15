import { formatProductionQuantity } from "../productionUi";
import type { HorizonKey, HorizonTile } from "../hooks/useProductMrpRecommendations";

type Props = {
  tiles: HorizonTile[];
  loading: boolean;
  activeKey: HorizonKey | null;
  onSelect: (tile: HorizonTile) => void;
};

function formatQty(qty: number | null, loading: boolean): string {
  if (loading) return "…";
  if (qty == null) return "—";
  return `${formatProductionQuantity(qty)} szt.`;
}

/** Compact MRP horizon chips — only horizons with a real recommendation. */
export function RecommendedProductionTiles({ tiles, loading, activeKey, onSelect }: Props) {
  const withQty = tiles.filter((t) => t.quantity != null && t.quantity > 0);

  if (loading && tiles.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Rekomendowana ilość produkcji</h3>
        <p className="text-sm text-slate-500">Liczenie rekomendacji…</p>
      </div>
    );
  }

  if (!loading && withQty.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Rekomendowana ilość produkcji</h3>
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">
          Brak rekomendacji produkcyjnej dla wybranego produktu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Rekomendowana ilość produkcji</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {withQty.map((tile) => {
          const active = activeKey === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              disabled={loading}
              onClick={() => onSelect(tile)}
              className={[
                "flex min-h-[3.75rem] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition",
                active
                  ? "border-orange-500 bg-orange-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                loading ? "cursor-not-allowed opacity-60" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={active}
              aria-label={`${tile.label}: ${formatQty(tile.quantity, loading)}`}
            >
              <span className="text-xs font-medium text-slate-500">{tile.label}</span>
              <span
                className={`mt-1 text-sm font-bold tabular-nums ${
                  active ? "text-orange-800" : "text-slate-900"
                }`}
              >
                {formatQty(tile.quantity, loading)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
