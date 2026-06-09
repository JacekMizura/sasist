import { useLayoutEffect, useRef, useState } from "react";

import { ProductLikeSection } from "../../components/catalog/ProductLikeSection";
import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog/productLikeTokens";

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
  selectedBasket: SelectedBasket;
  onSelectBasket: (sel: SelectedBasket) => void;
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
  selectHint: string;
  addLevelLabel: string;
};

export function CartSectionGrid({
  rows,
  selectedBasket,
  onSelectBasket,
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
  selectHint,
  addLevelLabel,
}: CartSectionGridProps) {
  const rowContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(900);

  useLayoutEffect(() => {
    const el = rowContainerRef.current;
    if (!el) return;
    const update = () => setContainerWidthPx(el.offsetWidth ?? 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalSections = rows.reduce((n, r) => n + r.baskets.length, 0);
  const totalVol = rows.reduce(
    (acc, r) => acc + r.baskets.reduce((s, b) => s + basketVolume(b), 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
        <div>
          <span className="text-slate-500">Sekcje: </span>
          <span className="font-semibold tabular-nums text-slate-900">{totalSections}</span>
        </div>
        <div>
          <span className="text-slate-500">Poziomy: </span>
          <span className="font-semibold tabular-nums text-slate-900">{rows.length}</span>
        </div>
        <div>
          <span className="text-slate-500">Łączna pojemność: </span>
          <span className="font-semibold tabular-nums text-slate-900">{totalVol.toFixed(1)} dm³</span>
        </div>
      </div>

      <div ref={rowContainerRef} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        {rows.map((row, rIdx) => {
          const gapPx = 12;
          const rowPaddingPx = 24;
          const buttonAreaPx = 48;
          const MIN_WIDTH = 88;
          const BASKET_HEIGHT = 88;
          const rowTotalWidthCm = row.baskets.reduce((sum, b) => sum + (Number(b.width) || 0), 0);
          const availableWidthPx = Math.max(
            100,
            containerWidthPx -
              rowPaddingPx -
              (row.baskets.length > 0 ? (row.baskets.length - 1) * gapPx + buttonAreaPx : 0)
          );
          const scale = rowTotalWidthCm > 0 ? availableWidthPx / rowTotalWidthCm : 1;

          return (
            <div key={rIdx} className="rounded-lg border border-slate-200/90 bg-slate-50/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {levelLabel(rIdx + 1)}
                </span>
                <span className="text-xs text-slate-500">{row.baskets.length} sekcji</span>
              </div>
              <div className="flex items-end gap-3 overflow-x-auto pb-1">
                {row.baskets.map((b, bIdx) => {
                  const isSelected = selectedBasket?.r === rIdx && selectedBasket?.b === bIdx;
                  const isInvalid = !b.name || b.length <= 0 || b.width <= 0 || b.height <= 0;
                  const widthPx = (Number(b.width) || 0) * scale;
                  const finalWidth = Math.max(widthPx, MIN_WIDTH);
                  const vol = basketVolume(b);

                  return (
                    <button
                      key={bIdx}
                      type="button"
                      onClick={() => onSelectBasket(isSelected ? null : { r: rIdx, b: bIdx })}
                      className={`flex shrink-0 flex-col items-stretch rounded-lg border-2 p-2 text-left transition-all ${
                        isSelected
                          ? "border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-200/60"
                          : isInvalid
                            ? "border-red-300 bg-red-50/80"
                            : "border-slate-300 bg-white hover:border-slate-400 hover:shadow-sm"
                      }`}
                      style={{ width: `${finalWidth}px`, minHeight: `${BASKET_HEIGHT}px` }}
                    >
                      <span className="truncate text-xs font-bold text-slate-900">{b.name || noNameLabel}</span>
                      <span className="mt-1 text-[10px] tabular-nums text-slate-500">
                        {b.width}×{b.length}×{b.height} cm
                      </span>
                      <span className="mt-auto pt-2 text-[11px] font-semibold tabular-nums text-slate-700">
                        {vol.toFixed(1)} dm³
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onAddBasket(rIdx)}
                  className="flex h-[88px] w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-xl text-slate-400 hover:border-slate-400 hover:text-slate-700"
                  aria-label="Dodaj sekcję"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddLevel}
          className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
        >
          + {addLevelLabel}
        </button>
      </div>

      <ProductLikeSection title="Edycja sekcji">
        {selectedBasket ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={productLikeFieldLabelClass}>{sectionNameLabel}</label>
              <input
                className={`${productLikeInputClass} uppercase ${!rows[selectedBasket.r].baskets[selectedBasket.b].name ? "border-red-400" : ""}`}
                value={rows[selectedBasket.r].baskets[selectedBasket.b].name}
                onChange={(e) => onUpdateBasket(selectedBasket.r, selectedBasket.b, { name: e.target.value })}
                placeholder={sectionNamePlaceholder}
              />
            </div>
            {(
              [
                ["width", widthLabel],
                ["length", lengthLabel],
                ["height", heightLabel],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className={productLikeFieldLabelClass}>{label} (cm)</label>
                <input
                  type="number"
                  className={`${productLikeInputClass} tabular-nums ${Number(rows[selectedBasket.r].baskets[selectedBasket.b][field]) <= 0 ? "border-red-400" : ""}`}
                  value={rows[selectedBasket.r].baskets[selectedBasket.b][field] || ""}
                  onChange={(e) =>
                    onUpdateBasket(selectedBasket.r, selectedBasket.b, {
                      [field]: Number(e.target.value),
                    })
                  }
                />
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={() => onRemoveBasket(selectedBasket.r, selectedBasket.b)}
                className="rounded border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                {removeSectionLabel}
              </button>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">{selectHint}</p>
        )}
      </ProductLikeSection>
    </div>
  );
}

export { basketVolume };
