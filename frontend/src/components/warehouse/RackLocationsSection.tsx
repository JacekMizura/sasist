import { useMemo, useState } from "react";
import type { LayoutState, RackState, BinState } from "../../types/warehouse";
import {
  binUsedVolumeDm3,
  binVolumeDm3,
  getLevelConfig,
  isBinActive,
  isBinDirectionRtl,
} from "./warehouseUtils";
import { countPassageVoidLevelsForRack, storageLevelConfigAfterVoid } from "./passageStorage";
import { PassageVoidBand } from "./PassageVoidBand";
import { resolveWarehouseLocation } from "../../utils/resolvedWarehouseLocation";

export type RackBinSelection = { level_index: number; segment_index: number } | null;

type Props = {
  layout: LayoutState;
  rack: RackState;
  /** Controlled selection; if omitted, selection is local only. */
  selectedBin?: RackBinSelection;
  onSelectedBinChange?: (v: RackBinSelection) => void;
};

/**
 * Construction-level location cards (former side-view grid).
 * Click = selection only — no WMS, no product edit.
 */
export function RackLocationsSection({
  layout,
  rack,
  selectedBin: controlledSelected,
  onSelectedBinChange,
}: Props) {
  const [localSelected, setLocalSelected] = useState<RackBinSelection>(null);
  const selectedBin = onSelectedBinChange ? controlledSelected ?? null : localSelected;
  const setSelectedBin = onSelectedBinChange ?? setLocalSelected;

  const binDirectionRtl = useMemo(() => isBinDirectionRtl(layout, rack), [layout, rack]);
  const voidLevelCount = useMemo(() => countPassageVoidLevelsForRack(rack), [rack]);
  const storageLevels = useMemo(() => {
    const structural = getLevelConfig(rack);
    return storageLevelConfigAfterVoid(structural, voidLevelCount);
  }, [rack, voidLevelCount]);

  const binsByLevel = useMemo(() => {
    const map = new Map<number, BinState[]>();
    for (const b of rack.bins) {
      if (!isBinActive(b)) continue;
      if (!map.has(b.level_index)) map.set(b.level_index, []);
      map.get(b.level_index)!.push(b);
    }
    for (let storageIdx = 0; storageIdx < storageLevels.length; storageIdx++) {
      const structural = storageIdx + voidLevelCount;
      if (!map.has(structural)) map.set(structural, []);
    }
    return map;
  }, [rack.bins, storageLevels.length, voidLevelCount]);

  if (storageLevels.length === 0 && voidLevelCount <= 0) {
    return <p className="text-[11px] text-slate-500">Brak lokalizacji na tym regale.</p>;
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: storageLevels.length }, (_, storageIdx) => storageIdx)
        .reverse()
        .map((storageIdx) => {
          const structural = storageIdx + voidLevelCount;
          const constructionNumber = structural + 1;
          const binsSorted = [...(binsByLevel.get(structural) ?? [])].sort(
            (a, b) => a.segment_index - b.segment_index
          );
          const binsForDisplay = binDirectionRtl ? [...binsSorted].reverse() : binsSorted;
          return (
            <div key={structural} className="rounded-lg border border-slate-200 bg-slate-50/80 p-2">
              <p className="mb-1.5 text-[10px] font-bold uppercase text-slate-600">
                Poziom konstrukcyjny {constructionNumber}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {binsForDisplay.map((b) => {
                  const vol = binVolumeDm3(b, rack);
                  const used = binUsedVolumeDm3(b);
                  const occupied = used > 0.001;
                  const isSelected =
                    selectedBin?.level_index === b.level_index &&
                    selectedBin?.segment_index === b.segment_index;
                  const displayLoc = resolveWarehouseLocation(rack, b, layout).label;
                  return (
                    <button
                      key={b.locationUUID ?? `${b.level_index}-${b.segment_index}-${b.label}`}
                      type="button"
                      onClick={() =>
                        setSelectedBin(
                          isSelected
                            ? null
                            : { level_index: b.level_index, segment_index: b.segment_index }
                        )
                      }
                      className={`min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                        isSelected
                          ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-400"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                      title={displayLoc}
                    >
                      <div className="truncate font-mono text-[11px] font-semibold text-slate-800">
                        {displayLoc}
                      </div>
                      <div
                        className={`mt-0.5 text-[9px] font-medium ${
                          occupied ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {occupied ? "Lokalizacja zajęta" : "Lokalizacja pusta"}
                      </div>
                      {vol > 0 ? (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              occupied ? "bg-amber-500" : "bg-emerald-400"
                            }`}
                            style={{ width: `${Math.min(100, (used / vol) * 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      {voidLevelCount > 0 && (
        <PassageVoidBand
          heightCm={40 * voidLevelCount}
          constructionLevelFrom={1}
          constructionLevelTo={voidLevelCount}
          compact
          className="overflow-hidden rounded-lg"
        />
      )}
    </div>
  );
}
