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
  return `${qty} szt.`;
}

/** Compact MRP horizon chips — label + suggested qty only. */
export function RecommendedProductionTiles({ tiles, loading, activeKey, onSelect }: Props) {
  if (tiles.length === 0 && !loading) return null;

  const list =
    tiles.length > 0
      ? tiles
      : ([
          { key: "today", label: "Dzisiaj", quantity: null },
          { key: "3", label: "3 dni", quantity: null },
          { key: "7", label: "7 dni", quantity: null },
          { key: "14", label: "14 dni", quantity: null },
          { key: "21", label: "21 dni", quantity: null },
          { key: "30", label: "30 dni", quantity: null },
          { key: "max", label: "Maksimum", quantity: null },
        ] as HorizonTile[]);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Rekomendowana ilość produkcji</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {list.map((tile) => {
          const active = activeKey === tile.key;
          const disabled = loading || tile.quantity == null;
          return (
            <button
              key={tile.key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(tile)}
              className={[
                "flex min-h-[4.25rem] flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition",
                active
                  ? "border-orange-500 bg-orange-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                disabled && !active ? "cursor-not-allowed opacity-60" : "",
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
