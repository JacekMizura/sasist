import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutState } from "../../types/warehouse";
import type { RackState, InternalStructure, InternalLevel, BinState, StorageType } from "./warehouseTypes";
import {
  snapCm,
  binVolumeFromDimensions,
  effectiveRackDisplayName,
  getDisplayLocationLabelPhysicalOrder,
  getRackDisplayId,
  isBinDirectionRtl,
  levelHeightsForRack,
  normalizeInternalLevelsToCanonicalSegmentOrder,
  segmentIndexForVisualSlot,
} from "./warehouseUtils";
import { getStorageTypeStyle, normalizeStorageType, STORAGE_TYPE_OPTIONS } from "../../utils/storageTypes";
import { StorageTypeIcon } from "../../utils/storageTypeIcons";

export type InternalLayoutModalProps = {
  layout?: LayoutState | null;
  rack: RackState;
  warehouseLabel?: string;
  onSave: (internal_structure: InternalStructure, bins?: BinState[]) => void;
  onClose: () => void;
};

/** Standard pallet default when bin dimensions are missing */
const DEFAULT_BIN_WIDTH_CM = 100;
const DEFAULT_BIN_DEPTH_CM = 120;
const DEFAULT_BIN_HEIGHT_CM = 150;

function getInitialLevels(rack: RackState): InternalLevel[] {
  const defaultDepthCm = rack.length_cm ?? DEFAULT_BIN_DEPTH_CM;
  const fallbackBinWidth = (() => {
    const withWidth = (rack.bins ?? []).find((b) => typeof b.width_cm === "number" && Number.isFinite(b.width_cm) && b.width_cm > 0);
    return withWidth?.width_cm;
  })();
  const defaultWidthCm = fallbackBinWidth;
  if (rack.internal_structure?.levels?.length) {
    const defaultHeightCm = rack.height_cm ? Math.floor(rack.height_cm / rack.levels) : DEFAULT_BIN_HEIGHT_CM;
    return rack.internal_structure.levels.map((l, levelIndex) => ({
      height_cm: l.height_cm,
      locations: l.locations.map((loc, segmentIndex) => {
        const bin = rack.bins.find((b) => b.level_index === levelIndex && b.segment_index === segmentIndex);
        return {
        // Prefer rack bin width (template-propagated) during initialization.
        width_cm: bin?.width_cm ?? defaultWidthCm ?? loc.width_cm ?? DEFAULT_BIN_WIDTH_CM,
        depth_cm: loc.depth_cm ?? defaultDepthCm,
        height_cm: loc.height_cm ?? l.height_cm ?? defaultHeightCm,
      };}),
    }));
  }
  const levelHeights = rack.height_cm && rack.levels > 0
    ? levelHeightsForRack(rack.height_cm, rack.levels)
    : Array.from({ length: rack.levels }, () => DEFAULT_BIN_HEIGHT_CM);
  const locationWidthCm = defaultWidthCm;
  return Array.from({ length: rack.levels }, (_, i) => {
    const levelHeightCm = levelHeights[i] ?? DEFAULT_BIN_HEIGHT_CM;
    return {
      height_cm: levelHeightCm,
      locations: Array.from({ length: rack.bins_per_level }, () => ({
        width_cm: locationWidthCm,
        depth_cm: defaultDepthCm,
        height_cm: levelHeightCm,
      })),
    };
  });
}

function binKey(levIdx: number, segIdx: number) {
  return `${levIdx}-${segIdx}`;
}

function getColumnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function finitePositiveOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatDimBadge(prefix: string, value: number | null): string {
  if (value == null) return `${prefix} —`;
  return `${prefix} ${Math.round(value)}`;
}

function structureSignature(levels: InternalLevel[]): string {
  const levelCounts = levels.map((l) => l.locations.length).join(",");
  return `${levels.length}|${levelCounts}`;
}

export function InternalLayoutModal({ layout = null, rack, warehouseLabel, onSave, onClose }: InternalLayoutModalProps) {
  const rackWidthCm = rack.width_cm;
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const scrollRestoreRef = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inInput =
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          (document.activeElement as HTMLElement).isContentEditable);
      if (inInput) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRestoreRef.current = contentScrollRef.current?.scrollTop ?? 0;
    return () => {
      requestAnimationFrame(() => {
        if (contentScrollRef.current) contentScrollRef.current.scrollTop = scrollRestoreRef.current;
      });
    };
  }, []);

  const rackTitle = layout ? effectiveRackDisplayName(rack, layout) : getRackDisplayId(rack, layout ?? undefined);
  const warehousePart = warehouseLabel?.trim() || "Magazyn";

  /** Same rack row as in `layout.racks` (uuid, then id/rack_index) so row_container lookup matches slot `rackId`. */
  const rackFromLayout = useMemo(() => {
    if (!layout?.racks?.length) return rack;
    if (rack.uuid != null && String(rack.uuid) !== "") {
      const byUuid = layout.racks.find((r) => r.uuid != null && String(r.uuid) === String(rack.uuid));
      if (byUuid) return byUuid;
    }
    return (
      layout.racks.find((r) => String(r.id ?? r.rack_index) === String(rack.id ?? rack.rack_index)) ?? rack
    );
  }, [layout, rack]);

  /** Same predicate / mapping as `RackSideViewGrid` (`isBinDirectionRtl` + `segmentIndexForVisualSlot`). */
  const binDirectionRtl = useMemo(() => isBinDirectionRtl(layout, rackFromLayout), [layout, rackFromLayout]);

  const initialLevelsRaw = useMemo(() => getInitialLevels(rack), [rack]);
  const initialLevels = useMemo(
    () => normalizeInternalLevelsToCanonicalSegmentOrder(initialLevelsRaw, rackFromLayout, binDirectionRtl),
    [initialLevelsRaw, rackFromLayout, binDirectionRtl]
  );

  const [levels, setLevels] = useState<Array<InternalLevel>>(() => initialLevels);
  const [editingDimensionsKey, setEditingDimensionsKey] = useState<string | null>(null);
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    (rack.bins ?? []).forEach((b) => {
      const key = binKey(b.level_index, b.segment_index);
      const code = `${getColumnLetter(b.segment_index)}-${b.level_index + 1}`;
      const candidate = String(b.label ?? "").trim();
      if (candidate && candidate !== code) out[key] = candidate;
    });
    return out;
  });
  const [editingNameKey, setEditingNameKey] = useState<string | null>(null);
  const [storageTypeOverrides, setStorageTypeOverrides] = useState<Record<string, StorageType>>(() => {
    const out: Record<string, StorageType> = {};
    rack.bins.forEach((b) => {
      const key = binKey(b.level_index, b.segment_index);
      out[key] = normalizeStorageType(b.storage_type);
    });
    return out;
  });
  const initialStructureSig = useMemo(() => structureSignature(initialLevels), [initialLevels]);
  const currentStructureSig = useMemo(() => structureSignature(levels), [levels]);
  const isVariantMode = currentStructureSig !== initialStructureSig;

  const levelWidthSum = (lev: InternalLevel) => lev.locations.reduce((sum, loc) => sum + Number(loc.width_cm ?? 0), 0);
  const rackWidthLimit = typeof rackWidthCm === "number" && Number.isFinite(rackWidthCm) ? rackWidthCm : Number.POSITIVE_INFINITY;
  const totalHeightCm = levels.reduce((s, lev) => s + lev.height_cm, 0);
  const totalStructureHeightCm = Math.max(
    1,
    levels.reduce((sum, lev) => sum + Math.max(0, Number(lev.height_cm ?? 0)), 0)
  );
  const heightExceeded = totalHeightCm > rack.height_cm;
  const hasAnyLevelWidthExceeded = levels.some((lev) => levelWidthSum(lev) > rackWidthLimit + 0.01);
  const valid = !heightExceeded && !hasAnyLevelWidthExceeded;
  const maxLocsPerLevel = levels.length ? Math.max(...levels.map((l) => l.locations.length)) : 0;
  const fitsWithoutVerticalScroll = levels.length <= 8;
  const fitsWithoutHorizontalScroll = maxLocsPerLevel <= 10;
  const addLevel = () => setLevels((prev) => [...prev, { height_cm: DEFAULT_BIN_HEIGHT_CM, locations: [{ width_cm: rackWidthCm ?? DEFAULT_BIN_WIDTH_CM, depth_cm: rack.length_cm ?? DEFAULT_BIN_DEPTH_CM, height_cm: DEFAULT_BIN_HEIGHT_CM }] }]);
  const removeLevel = (i: number) => setLevels((prev) => prev.filter((_, idx) => idx !== i));
  const setLevelHeight = (i: number, h: number) => setLevels((prev) => prev.map((l, idx) => (idx === i ? { ...l, height_cm: snapCm(h) } : l)));
  const setLocationWidth = (levIdx: number, locIdx: number, w: number) =>
    setLevels((prev) =>
      prev.map((l, i) => (i === levIdx ? { ...l, locations: l.locations.map((loc, j) => (j === locIdx ? { ...loc, width_cm: snapCm(w) } : loc)) } : l))
    );
  const setLocationDepth = (levIdx: number, locIdx: number, d: number) =>
    setLevels((prev) =>
      prev.map((l, i) => (i === levIdx ? { ...l, locations: l.locations.map((loc, j) => (j === locIdx ? { ...loc, depth_cm: snapCm(d) } : loc)) } : l))
    );
  const setLocationHeight = (levIdx: number, locIdx: number, h: number) =>
    setLevels((prev) =>
      prev.map((l, i) => (i === levIdx ? { ...l, locations: l.locations.map((loc, j) => (j === locIdx ? { ...loc, height_cm: snapCm(h) } : loc)) } : l))
    );
  const addLocation = (levIdx: number, sourceLocIdx?: number) => {
    const lev = levels[levIdx];
    const lastLoc = lev?.locations[lev.locations.length - 1];
    const nextLocIdx = lev?.locations.length ?? 0;
    const sourceType = sourceLocIdx != null ? getBinStorageType(levIdx, sourceLocIdx) : undefined;
    const fallbackType = lev && lev.locations.length > 0 ? getBinStorageType(levIdx, lev.locations.length - 1) : "primary";
    const inheritedType = normalizeStorageType(sourceType ?? fallbackType ?? "primary");
    setLevels((prev) => prev.map((l, i) => {
      if (i !== levIdx) return l;
      const nextLocations = [...l.locations, { width_cm: lastLoc?.width_cm ?? DEFAULT_BIN_WIDTH_CM, depth_cm: lastLoc?.depth_cm ?? rack.length_cm ?? DEFAULT_BIN_DEPTH_CM, height_cm: lastLoc?.height_cm ?? l.height_cm ?? DEFAULT_BIN_HEIGHT_CM }];
      // Optional UX: when structure changes, distribute width across new count for easier recovery.
      const autoWidth = rackWidthCm && Number.isFinite(rackWidthCm) && rackWidthCm > 0 ? snapCm(rackWidthCm / Math.max(1, nextLocations.length)) : null;
      return {
        ...l,
        locations: autoWidth != null ? nextLocations.map((loc) => ({ ...loc, width_cm: autoWidth })) : nextLocations,
      };
    }));
    setStorageTypeOverrides((prev) => ({ ...prev, [binKey(levIdx, nextLocIdx)]: inheritedType }));
  };
  const removeLocation = (levIdx: number, locIdx: number) =>
    setLevels((prev) => prev.map((l, i) => (i === levIdx ? { ...l, locations: l.locations.filter((_, j) => j !== locIdx) } : l)));

  const getBinStorageType = (levIdx: number, segIdx: number): StorageType => {
    const key = binKey(levIdx, segIdx);
    if (key in storageTypeOverrides) return storageTypeOverrides[key];
    const bin = rack.bins.find((b) => b.level_index === levIdx && b.segment_index === segIdx);
    return normalizeStorageType(bin?.storage_type);
  };
  const setBinStorageType = (levIdx: number, segIdx: number, value: StorageType) => {
    setStorageTypeOverrides((prev) => ({ ...prev, [binKey(levIdx, segIdx)]: value }));
  };

  const handleSave = () => {
    const existingByKey = new Map<string, BinState>();
    rack.bins.forEach((b) => {
      existingByKey.set(binKey(b.level_index, b.segment_index), b);
    });

    const newBins: BinState[] = [];

    levels.forEach((lev, levelIndex) => {
      const levelNumber = levelIndex + 1;
      lev.locations.forEach((loc, segmentIndex) => {
        const key = binKey(levelIndex, segmentIndex);
        const existing = existingByKey.get(key);
        const generatedLabel = `${getColumnLetter(segmentIndex)}-${levelNumber}`;
        const customName = String(customNames[key] ?? "").trim();
        const width_cm = loc?.width_cm ?? existing?.width_cm ?? DEFAULT_BIN_WIDTH_CM;
        const depth_cm = loc?.depth_cm ?? existing?.depth_cm ?? rack.length_cm ?? DEFAULT_BIN_DEPTH_CM;
        const height_cm = loc?.height_cm ?? existing?.height_cm ?? lev.height_cm ?? DEFAULT_BIN_HEIGHT_CM;
        const volume_dm3 = binVolumeFromDimensions(width_cm, depth_cm, height_cm);
        const used = existing?.used_volume_dm3 ?? existing?.current_load_dm3 ?? 0;
        const storageType = normalizeStorageType(storageTypeOverrides[key] ?? existing?.storage_type ?? "primary");

        newBins.push({
          id: existing?.id,
          label: customName || generatedLabel,
          level_index: levelIndex,
          segment_index: segmentIndex,
          volume_dm3,
          current_load_dm3: used,
          used_volume_dm3: used,
          width_cm,
          depth_cm,
          height_cm,
          location_id: generatedLabel,
          locationUUID:
            existing?.locationUUID ??
            (typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `loc-${Date.now()}-${levelIndex}-${segmentIndex}-${Math.random().toString(36).slice(2, 9)}`),
          barcode_data: generatedLabel,
          storage_type: storageType,
        });
      });
    });

    const totalLocations = levels.reduce((sum, lev) => sum + lev.locations.length, 0);
    if (totalLocations !== newBins.length) {
      console.error("BIN SYNC ERROR", { totalLocations, bins: newBins.length });
    }

    onSave({ levels }, newBins);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      dir="ltr"
      style={{ direction: "ltr" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[95vw] max-h-[90vh] h-[90vh] overflow-hidden flex flex-col"
        dir="ltr"
        style={{ direction: "ltr" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <nav className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500" aria-label="Nawigacja">
              <button type="button" onClick={onClose} className="font-medium text-blue-700 hover:underline">
                {warehousePart}
              </button>
              <span>/</span>
              <button type="button" onClick={onClose} className="truncate font-medium text-blue-700 hover:underline">
                Regał {rackTitle}
              </button>
              <span>/</span>
              <span className="font-semibold text-slate-700">Układ wewnętrzny</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                ← Wróć do planu
              </button>
              <h3 className="font-bold text-slate-800">Układ wewnętrzny</h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded border px-2 py-1 text-[11px] ${isVariantMode ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {isVariantMode ? "Tryb wariantu" : "Tryb szablonu"}
            </span>
            <button type="button" aria-label="Zamknij" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
              ✕
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 px-5 py-1 shrink-0">Szerokość regału: {rackWidthCm} cm. Wysokość regału: {rack.height_cm} cm. Suma wysokości poziomów i suma szerokości lokalizacji na poziom nie mogą przekraczać limitów regału.</p>
        {heightExceeded && (
          <p className="text-sm font-semibold text-red-600 px-5 py-1 shrink-0" role="alert">
            {`Suma wysokości poziomów (${totalHeightCm} cm) przekracza wysokość regału (${rack.height_cm} cm).`}
          </p>
        )}
        <div
          ref={contentScrollRef}
          className={`flex min-h-0 flex-1 flex-col p-4 ${fitsWithoutVerticalScroll ? "overflow-hidden" : "overflow-y-auto"}`}
          dir="ltr"
          style={{ direction: "ltr" }}
        >
          <div
            className={`flex flex-col gap-0 flex-1 min-h-0 ${fitsWithoutVerticalScroll ? "flex" : ""}`}
            dir="ltr"
            style={{ direction: "ltr" }}
          >
            <button type="button" onClick={addLevel} className="w-full py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 text-sm mb-2 hover:bg-slate-50 shrink-0">
              + Dodaj poziom
            </button>
            {/* Levels rendered top-to-bottom: highest level (Poziom L) at top, Poziom 1 at bottom */}
            {[...levels].reverse().map((lev, revIdx) => {
              const levIdx = levels.length - 1 - revIdx;
              const levelNumber = levIdx + 1;
              const levelHeightPercent = (Math.max(0, Number(lev.height_cm ?? 0)) / totalStructureHeightCm) * 100;
              const levelTotalWidth = levelWidthSum(lev);
              const levelWidthExceeded = levelTotalWidth > rackWidthLimit + 0.01;
              return (
                <div
                  key={levIdx}
                  className={`border-b-2 first:border-t-2 first:border-t-slate-300 flex flex-col min-h-0 ${
                    levelWidthExceeded
                      ? "bg-red-50/60 border-b-red-400"
                      : `bg-slate-50/50 ${revIdx < levels.length - 1 ? "border-b-orange-500" : "border-b-slate-300"}`
                  }`}
                  dir="ltr"
                  style={{
                    direction: "ltr",
                    height: `${levelHeightPercent}%`,
                    minHeight: "60px",
                    transition: "height 0.2s ease",
                  }}
                >
                  <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-200 bg-white/80 shrink-0">
                    <span className="text-xs font-bold text-slate-700">Poziom {levelNumber}</span>
                    <label className="text-[10px] text-slate-500 flex items-center gap-1">Wys. (cm): <input type="number" min={10} step={10} value={lev.height_cm} onChange={(e) => setLevelHeight(levIdx, Number(e.target.value))} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs bg-white" /></label>
                    <button type="button" onClick={() => removeLevel(levIdx)} className="text-red-600 text-xs font-semibold hover:underline">Usuń poziom</button>
                  </div>
                  {/* vis = left→right; binIndex = data. direction + unicode-bidi isolate so flex main-start stays left (no RTL flex reversal). */}
                  <div
                    className="flex flex-row flex-nowrap justify-start items-start min-h-0 gap-2 p-2"
                    dir="ltr"
                    style={{ direction: "ltr", unicodeBidi: "isolate" }}
                  >
                    {Array.from({ length: lev.locations.length }, (_, vis) => {
                      const locs = lev.locations.length;
                      const binIndex = segmentIndexForVisualSlot(vis, locs, binDirectionRtl);
                      const loc = lev.locations[binIndex]!;
                      const binState = rackFromLayout.bins.find((b) => b.level_index === levIdx && b.segment_index === binIndex);
                      const templateCodeLabel = `${getColumnLetter(binIndex)}-${levelNumber}`;
                      /** Physical segment order only: `getDisplayLocationLabel` mirrors RTL in `getBinDisplayLabel`, which would show A…D left→right even when tiles are D…A. */
                      const displayLocationLabel =
                        layout && binState
                          ? getDisplayLocationLabelPhysicalOrder(rackFromLayout, binState, layout)
                          : templateCodeLabel;
                      const cellKey = binKey(levIdx, binIndex);
                      const customName = customNames[cellKey]?.trim() ?? "";
                      const showPrimaryName = customName || displayLocationLabel;
                      const storageType = getBinStorageType(levIdx, binIndex);
                      const storageStyle = getStorageTypeStyle(storageType);
                      const slotsInLevel = Math.max(1, lev.locations.length);
                      const equalWidthFallback =
                        finitePositiveOrNull(rackWidthCm) != null ? (finitePositiveOrNull(rackWidthCm)! / slotsInLevel) : null;
                      const widthCm = finitePositiveOrNull(loc.width_cm) ?? equalWidthFallback;
                      const totalWidth = lev.locations.reduce((sum, l) => sum + Math.max(0, Number(l.width_cm ?? 0)), 0);
                      const count = Math.max(1, lev.locations.length);
                      const widthPct = totalWidth > 0 ? (Math.max(0, Number(widthCm ?? 0)) / totalWidth) * 100 : 100 / count;
                      const gapPx = 8;
                      const widthCss = `calc(${widthPct}% - ${(gapPx * (count - 1)) / count}px)`;
                      const depthCm = finitePositiveOrNull(loc.depth_cm) ?? finitePositiveOrNull(rack.length_cm) ?? null;
                      const heightCm = finitePositiveOrNull(loc.height_cm) ?? finitePositiveOrNull(lev.height_cm) ?? null;
                      const volDm3 = widthCm != null && depthCm != null && heightCm != null
                        ? binVolumeFromDimensions(widthCm, depthCm, heightCm)
                        : 0;
                      const parseDim = (v: string) => {
                        const n = parseFloat(String(v).replace(",", "."));
                        return Number.isNaN(n) ? null : Math.max(10, n);
                      };
                      const handleDimChange = (setter: (a: number, b: number, c: number) => void, val: string) => {
                        const n = parseDim(val);
                        if (n !== null) setter(levIdx, binIndex, snapCm(n));
                      };
                      return (
                        <div
                          key={`${levIdx}-${binIndex}`}
                          className="relative flex flex-col rounded-xl border shadow-sm min-w-0 overflow-hidden p-2.5 h-[170px] shrink-0"
                          style={{
                            width: widthCss,
                            transition: "width 0.2s ease",
                            boxSizing: "border-box",
                            backgroundColor: storageStyle.bg,
                            borderColor: storageStyle.border,
                          }}
                        >
                          <>
                              <button
                                type="button"
                                onClick={() => removeLocation(levIdx, binIndex)}
                                className="absolute top-2 right-2 h-5 w-5 rounded border border-red-200 bg-red-100 text-[11px] font-bold text-red-700 hover:bg-red-200 z-10"
                                title="Usuń lokalizację"
                              >
                                ✕
                              </button>
                              <div className="flex items-start justify-between gap-2 pr-7">
                                <div className="min-w-0 flex-1">
                                  {editingNameKey === cellKey ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={customNames[cellKey] ?? ""}
                                      onChange={(e) => setCustomNames((prev) => ({ ...prev, [cellKey]: e.target.value }))}
                                      onBlur={() => setEditingNameKey(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          setEditingNameKey(null);
                                        }
                                        if (e.key === "Escape") {
                                          e.preventDefault();
                                          setEditingNameKey(null);
                                        }
                                      }}
                                      placeholder="Nazwa własna lokalizacji"
                                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[14px] font-semibold text-slate-800"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditingNameKey(cellKey)}
                                      className="text-left w-full"
                                      title="Kliknij, aby edytować nazwę lokalizacji"
                                    >
                                      <span className="inline-flex items-center rounded-md bg-white/80 border border-slate-200 px-2 py-0.5 text-[16px] font-bold text-slate-800 max-w-full truncate leading-tight">
                                        {showPrimaryName}
                                      </span>
                                      {customName ? (
                                        <span className="block mt-0.5 text-[10px] text-slate-500 font-mono">
                                          {displayLocationLabel}
                                        </span>
                                      ) : null}
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {editingDimensionsKey === cellKey ? (
                                    <div className="inline-flex items-center gap-1 bg-white/80 border border-slate-200 rounded-md px-1 py-0.5">
                                      <span className="text-[10px] font-bold text-slate-600">SZ</span>
                                      {isVariantMode ? (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={widthCm ?? ""}
                                          onChange={(e) => handleDimChange(setLocationWidth, e.target.value)}
                                          className="w-[44px] rounded border border-slate-200 px-1 py-0.5 text-[10px] text-right bg-white"
                                          title="Szerokość (cm)"
                                        />
                                      ) : (
                                        <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-right text-slate-700 min-w-[44px] justify-end" title="Szerokość (cm), tylko do odczytu w trybie szablonu">
                                          {widthCm != null ? Math.round(widthCm) : "—"}
                                        </span>
                                      )}
                                      <span className="text-[10px] font-bold text-slate-600">GŁ</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={depthCm ?? ""}
                                        onChange={(e) => handleDimChange(setLocationDepth, e.target.value)}
                                        className="w-[44px] rounded border border-slate-200 px-1 py-0.5 text-[10px] text-right bg-white"
                                        title="Głębokość (cm)"
                                      />
                                      <span className="text-[10px] font-bold text-slate-600">WYS</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={heightCm ?? ""}
                                        onChange={(e) => handleDimChange(setLocationHeight, e.target.value)}
                                        className="w-[44px] rounded border border-slate-200 px-1 py-0.5 text-[10px] text-right bg-white"
                                        title="Wysokość (cm)"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setEditingDimensionsKey(null)}
                                        className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-600 hover:bg-slate-50"
                                      >
                                        OK
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditingDimensionsKey(cellKey)}
                                      className="inline-flex items-center gap-1 text-left"
                                      title="Kliknij, aby edytować wymiary"
                                    >
                                      <span className="inline-flex items-center rounded-md bg-white/80 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{formatDimBadge("SZ", widthCm)}</span>
                                      <span className="inline-flex items-center rounded-md bg-white/80 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{formatDimBadge("GŁ", depthCm)}</span>
                                      <span className="inline-flex items-center rounded-md bg-white/80 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{formatDimBadge("WYS", heightCm)}</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-2 overflow-hidden">
                                <div className="flex items-center gap-2 min-h-6">
                                  {(() => {
                                    const selected = STORAGE_TYPE_OPTIONS.find((option) => option.value === storageType);
                                    if (!selected) return null;
                                    const selectedStyle = getStorageTypeStyle(selected.value);
                                    return (
                                      <span
                                        className="h-6 px-2 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 shrink-0"
                                        style={{
                                          backgroundColor: selectedStyle.bg,
                                          borderColor: selectedStyle.border,
                                          color: selectedStyle.text,
                                        }}
                                      >
                                        <StorageTypeIcon storageType={selected.value} size={11} />
                                        {selected.label}
                                      </span>
                                    );
                                  })()}
                                  <div className="flex items-center gap-1">
                                    {STORAGE_TYPE_OPTIONS.map((option) => {
                                      const isSelected = storageType === option.value;
                                      const optionStyle = getStorageTypeStyle(option.value);
                                      return (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => {
                                            setBinStorageType(levIdx, binIndex, option.value);
                                          }}
                                          className="h-6 w-6 rounded-md border inline-flex items-center justify-center"
                                          style={{
                                          backgroundColor: isSelected ? optionStyle.bg : "#f8fafc",
                                          borderColor: isSelected ? optionStyle.border : "#e2e8f0",
                                          color: isSelected ? optionStyle.text : "#94a3b8",
                                          }}
                                          title={option.label}
                                        >
                                          <StorageTypeIcon storageType={option.value} size={12} />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[12px] text-slate-800 font-semibold whitespace-nowrap">Pojemność: {volDm3.toFixed(0)} dm³</p>
                                  <button
                                    type="button"
                                    onClick={() => addLocation(levIdx, binIndex)}
                                    className="text-[10px] bg-blue-600 text-white rounded-md px-2 py-1 hover:bg-blue-700 shrink-0 mt-3"
                                  >
                                    + Lokalizacja
                                  </button>
                                </div>
                              </div>
                          </>
                        </div>
                      );
                    })}
                  </div>
                  <p className={`text-[10px] px-3 py-1 ${levelWidthExceeded ? "text-red-700 font-semibold" : "text-slate-500"}`}>
                    Szerokość lokacji (szablon): {Number((lev.locations[0]?.width_cm ?? 0).toFixed(2))} cm · Suma szerokości: {levelTotalWidth.toFixed(2)} cm {levelWidthExceeded ? "(przekroczono)" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="sticky bottom-0 flex shrink-0 gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Zamknij
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!valid}
            className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}
