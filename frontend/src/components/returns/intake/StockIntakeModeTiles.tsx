import { Box, Boxes, SplitSquareVertical } from "lucide-react";
import type { ReactNode } from "react";

import type { StockIntakeMode } from "../../../types/wmsReturn";
import type { ManufacturedIntakeCopy, StockIntakeTileId } from "./stockIntakeMode";

type Props = {
  copy: ManufacturedIntakeCopy;
  physicalQty: number;
  mode: StockIntakeMode | null;
  fgQty: number;
  disassemblyQty: number;
  disabled?: boolean;
  /** When true, FG tile cannot be selected (manufactured REQUIRED). */
  forceDisassemble?: boolean;
  onSelectTile: (tile: StockIntakeTileId) => void;
  onMixedFgChange: (fg: number) => void;
  onMixedDqChange: (dq: number) => void;
};

function tileIcon(id: StockIntakeTileId) {
  if (id === "FG") return <Box className="h-5 w-5 text-slate-600" strokeWidth={1.75} aria-hidden />;
  if (id === "DISASSEMBLE") return <Boxes className="h-5 w-5 text-slate-600" strokeWidth={1.75} aria-hidden />;
  return <SplitSquareVertical className="h-5 w-5 text-slate-600" strokeWidth={1.75} aria-hidden />;
}

function isSelected(mode: StockIntakeMode | null, tile: StockIntakeTileId): boolean {
  if (tile === "FG") return mode === "FG" || (mode == null && false);
  if (tile === "DISASSEMBLE") return mode === "DISASSEMBLE";
  return mode === "MIXED";
}

export function StockIntakeModeTiles({
  copy,
  physicalQty,
  mode,
  fgQty,
  disassemblyQty,
  disabled = false,
  forceDisassemble = false,
  onSelectTile,
  onMixedFgChange,
  onMixedDqChange,
}: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">{copy.sectionTitle}</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {copy.tiles.map((tile) => {
          const selected = isSelected(mode, tile.id);
          const tileDisabled = disabled || (forceDisassemble && tile.id === "FG");
          const footer: ReactNode =
            tile.footerKind === "fg" ? (
              <p className="text-[11px] text-slate-500">
                Ilość do przyjęcia:{" "}
                <span className="font-semibold tabular-nums text-slate-800">
                  {selected ? fgQty : physicalQty} szt.
                </span>
              </p>
            ) : tile.footerKind === "disassemble" ? (
              <p className="text-[11px] text-slate-500">
                Ilość do rozmontowania:{" "}
                <span className="font-semibold tabular-nums text-slate-800">
                  {selected ? disassemblyQty : physicalQty} szt.
                </span>
              </p>
            ) : selected ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-600">
                <label className="inline-flex items-center gap-1.5">
                  <span>{tile.mixedFgLabel}:</span>
                  <input
                    type="number"
                    min={0}
                    max={physicalQty}
                    step={1}
                    disabled={tileDisabled}
                    value={fgQty}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onMixedFgChange(Number(e.target.value))}
                    className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span>szt.</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <span>{tile.mixedDqLabel}:</span>
                  <input
                    type="number"
                    min={0}
                    max={physicalQty}
                    step={1}
                    disabled={tileDisabled}
                    value={disassemblyQty}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onMixedDqChange(Number(e.target.value))}
                    className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span>szt.</span>
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span>
                  {tile.mixedFgLabel}: <span className="tabular-nums">0</span> szt.
                </span>
                <span>
                  {tile.mixedDqLabel}: <span className="tabular-nums">0</span> szt.
                </span>
              </div>
            );

          return (
            <button
              key={tile.id}
              type="button"
              disabled={tileDisabled}
              onClick={() => onSelectTile(tile.id)}
              className={`relative flex min-h-[9.5rem] flex-col rounded-xl border bg-white p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-blue-500 ring-1 ring-blue-500"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span
                className={`absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border ${
                  selected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                }`}
                aria-hidden
              >
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <div className="mb-2 flex items-start gap-2 pr-6">
                {tileIcon(tile.id)}
                <div>
                  <p className="text-[13px] font-semibold leading-snug text-slate-900">{tile.title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{tile.description}</p>
                </div>
              </div>
              <div className="mt-auto border-t border-slate-100 pt-2">{footer}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
