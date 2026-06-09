import { useLayoutEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { CartBasketEditDrawer } from "./CartBasketEditDrawer";

export type BasketModel = {
  name: string;
  length: number;
  width: number;
  height: number;
};

export type RowModel = { baskets: BasketModel[] };

type SelectedBasket = { r: number; b: number } | null;

function basketVolume(b: BasketModel): number {
  return (Number(b.length) * Number(b.width) * Number(b.height)) / 1000;
}

type CartSectionGridProps = {
  rows: RowModel[];
  onAddBasket: (rowIdx: number) => void;
  onAddLevel: () => void;
  onUpdateBasket: (r: number, b: number, patch: Partial<BasketModel>) => void;
  onRemoveBasket: (r: number, b: number) => void;
  levelLabel: (n: number) => string;
  noNameLabel: string;
  sectionNameLabel: string;
  sectionNamePlaceholder: string;
  widthLabel: string;
  lengthLabel: string;
  heightLabel: string;
  removeSectionLabel: string;
  addLevelLabel: string;
};

export function CartSectionGrid({
  rows,
  onAddBasket,
  onAddLevel,
  onUpdateBasket,
  onRemoveBasket,
  levelLabel,
  noNameLabel,
  sectionNameLabel,
  sectionNamePlaceholder,
  widthLabel,
  lengthLabel,
  heightLabel,
  removeSectionLabel,
  addLevelLabel,
}: CartSectionGridProps) {
  const rowContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(900);
  const [selectedBasket, setSelectedBasket] = useState<SelectedBasket>(null);

  useLayoutEffect(() => {
    const el = rowContainerRef.current;
    if (!el) return;
    const update = () => setContainerWidthPx(el.offsetWidth ?? 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawerBasket =
    selectedBasket != null ? rows[selectedBasket.r]?.baskets[selectedBasket.b] ?? null : null;

  const handleRemove = () => {
    if (!selectedBasket) return;
    onRemoveBasket(selectedBasket.r, selectedBasket.b);
    setSelectedBasket(null);
  };

  return (
    <>
      <div ref={rowContainerRef} className="space-y-5">
        {rows.map((row, rIdx) => {
          const gapPx = 10;
          const rowPaddingPx = 0;
          const buttonAreaPx = 44;
          const MIN_WIDTH = 120;
          const BASKET_HEIGHT = 108;
          const rowTotalWidthCm = row.baskets.reduce((sum, b) => sum + (Number(b.width) || 0), 0);
          const availableWidthPx = Math.max(
            100,
            containerWidthPx -
              rowPaddingPx -
              (row.baskets.length > 0 ? (row.baskets.length - 1) * gapPx + buttonAreaPx : 0)
          );
          const scale = rowTotalWidthCm > 0 ? availableWidthPx / rowTotalWidthCm : 1;

          return (
            <div key={rIdx} className="rounded-lg border border-slate-200/90 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {levelLabel(rIdx + 1)}
                </span>
                <span className="text-xs tabular-nums text-slate-400">{row.baskets.length} kosz.</span>
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1">
                {row.baskets.map((b, bIdx) => {
                  const isInvalid = !b.name || b.length <= 0 || b.width <= 0 || b.height <= 0;
                  const widthPx = (Number(b.width) || 0) * scale;
                  const finalWidth = Math.max(widthPx, MIN_WIDTH);
                  const vol = basketVolume(b);

                  return (
                    <div
                      key={bIdx}
                      className={`flex shrink-0 flex-col rounded-lg border p-3 transition-shadow ${
                        isInvalid
                          ? "border-red-200 bg-white ring-1 ring-red-100"
                          : "border-slate-200/90 bg-white hover:shadow-sm"
                      }`}
                      style={{ width: `${finalWidth}px`, minHeight: `${BASKET_HEIGHT}px` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{b.name || noNameLabel}</p>
                        <p className="mt-1 text-[11px] tabular-nums text-slate-500">
                          {b.length} × {b.width} × {b.height} cm
                        </p>
                        <p className="mt-1 text-xs font-semibold tabular-nums text-slate-700">{vol.toFixed(1)} dm³</p>
                      </div>

                      <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          title="Edytuj"
                          onClick={() => setSelectedBasket({ r: rIdx, b: bIdx })}
                          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
                          Edytuj
                        </button>
                        <button
                          type="button"
                          title="Usuń"
                          onClick={() => onRemoveBasket(rIdx, bIdx)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    const colIdx = row.baskets.length;
                    onAddBasket(rIdx);
                    setSelectedBasket({ r: rIdx, b: colIdx });
                  }}
                  className="flex h-[108px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 bg-white text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
                  aria-label="Dodaj koszyk obok"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Obok
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddLevel}
          className="w-full rounded-lg border border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
        >
          + {addLevelLabel}
        </button>
      </div>

      <CartBasketEditDrawer
        open={selectedBasket != null}
        basket={drawerBasket}
        levelLabel={selectedBasket != null ? levelLabel(selectedBasket.r + 1) : ""}
        onClose={() => setSelectedBasket(null)}
        onChange={(patch) => {
          if (!selectedBasket) return;
          onUpdateBasket(selectedBasket.r, selectedBasket.b, patch);
        }}
        onRemove={handleRemove}
        sectionNameLabel={sectionNameLabel}
        sectionNamePlaceholder={sectionNamePlaceholder}
        widthLabel={widthLabel}
        lengthLabel={lengthLabel}
        heightLabel={heightLabel}
        removeSectionLabel={removeSectionLabel}
      />
    </>
  );
}

export { basketVolume };
