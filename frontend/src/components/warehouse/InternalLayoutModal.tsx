import { useState } from "react";
import type { RackState, InternalStructure, InternalLevel, BinState } from "./warehouseTypes";
import { snapCm, binVolumeFromDimensions, getRackDisplayId, levelHeightsForRack } from "./warehouseUtils";

export type InternalLayoutModalProps = {
  rack: RackState;
  onSave: (internal_structure: InternalStructure, bins?: BinState[]) => void;
  onClose: () => void;
};

/** Standard pallet default when bin dimensions are missing */
const DEFAULT_BIN_WIDTH_CM = 100;
const DEFAULT_BIN_DEPTH_CM = 120;
const DEFAULT_BIN_HEIGHT_CM = 150;

function getInitialLevels(rack: RackState): InternalLevel[] {
  const defaultDepthCm = rack.length_cm ?? DEFAULT_BIN_DEPTH_CM;
  const defaultWidthCm = rack.width_cm ? snapCm(rack.width_cm / rack.bins_per_level) : DEFAULT_BIN_WIDTH_CM;
  if (rack.internal_structure?.levels?.length) {
    const defaultHeightCm = rack.height_cm ? Math.floor(rack.height_cm / rack.levels) : DEFAULT_BIN_HEIGHT_CM;
    return rack.internal_structure.levels.map((l) => ({
      height_cm: l.height_cm,
      locations: l.locations.map((loc) => ({
        width_cm: loc.width_cm ?? defaultWidthCm,
        depth_cm: loc.depth_cm ?? defaultDepthCm,
        height_cm: loc.height_cm ?? l.height_cm ?? defaultHeightCm,
      })),
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

export function InternalLayoutModal({ rack, onSave, onClose }: InternalLayoutModalProps) {
  const rackWidthCm = rack.width_cm;
  const [levels, setLevels] = useState<Array<InternalLevel>>(() => getInitialLevels(rack));
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [storageTypeOverrides, setStorageTypeOverrides] = useState<Record<string, "primary" | "reserve">>(() => {
    const out: Record<string, "primary" | "reserve"> = {};
    rack.bins.forEach((b) => {
      const key = binKey(b.level_index, b.segment_index);
      if (b.storage_type) out[key] = b.storage_type;
    });
    return out;
  });

  const totalWidth = (lev: InternalLevel) => lev.locations.reduce((s, loc) => s + loc.width_cm, 0);
  const totalHeightCm = levels.reduce((s, lev) => s + lev.height_cm, 0);
  const heightExceeded = totalHeightCm > rack.height_cm;
  const widthExceeded = levels.some((lev) => totalWidth(lev) > rackWidthCm + 0.01);
  const valid = !heightExceeded && !widthExceeded;
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
  const addLocation = (levIdx: number) => {
    const lev = levels[levIdx];
    const lastLoc = lev?.locations[lev.locations.length - 1];
    setLevels((prev) => prev.map((l, i) => (i === levIdx ? { ...l, locations: [...l.locations, { width_cm: lastLoc?.width_cm ?? DEFAULT_BIN_WIDTH_CM, depth_cm: lastLoc?.depth_cm ?? rack.length_cm ?? DEFAULT_BIN_DEPTH_CM, height_cm: lastLoc?.height_cm ?? l.height_cm ?? DEFAULT_BIN_HEIGHT_CM }] } : l)));
  };
  const removeLocation = (levIdx: number, locIdx: number) =>
    setLevels((prev) => prev.map((l, i) => (i === levIdx ? { ...l, locations: l.locations.filter((_, j) => j !== locIdx) } : l)));

  const getBinLabel = (levIdx: number, segIdx: number) => {
    const key = binKey(levIdx, segIdx);
    if (key in labelOverrides) return labelOverrides[key];
    const bin = rack.bins.find((b) => b.level_index === levIdx && b.segment_index === segIdx);
    return bin?.barcode_data ?? bin?.location_id ?? bin?.label ?? "";
  };
  const setBinLabel = (levIdx: number, segIdx: number, value: string) => {
    setLabelOverrides((prev) => ({ ...prev, [binKey(levIdx, segIdx)]: value }));
  };
  const getBinStorageType = (levIdx: number, segIdx: number): "primary" | "reserve" => {
    const key = binKey(levIdx, segIdx);
    if (key in storageTypeOverrides) return storageTypeOverrides[key];
    const bin = rack.bins.find((b) => b.level_index === levIdx && b.segment_index === segIdx);
    return bin?.storage_type ?? "primary";
  };
  const setBinStorageType = (levIdx: number, segIdx: number, value: "primary" | "reserve") => {
    setStorageTypeOverrides((prev) => ({ ...prev, [binKey(levIdx, segIdx)]: value }));
  };

  const handleSave = () => {
    const mergedBins: BinState[] = rack.bins.map((b) => {
      const key = binKey(b.level_index, b.segment_index);
      const labelOverride = labelOverrides[key];
      const storageType = storageTypeOverrides[key] ?? b.storage_type ?? "primary";
      const lev = levels[b.level_index];
      const loc = lev?.locations[b.segment_index];
      const width_cm = loc?.width_cm ?? b.width_cm ?? rack.width_cm / rack.bins_per_level;
      const depth_cm = loc?.depth_cm ?? b.depth_cm ?? rack.length_cm;
      const height_cm = loc?.height_cm ?? b.height_cm ?? (lev?.height_cm ?? rack.height_cm / rack.levels);
      const volume_dm3 = binVolumeFromDimensions(width_cm, depth_cm, height_cm);
      const used = b.used_volume_dm3 ?? b.current_load_dm3 ?? 0;
      return {
        ...b,
        width_cm,
        depth_cm,
        height_cm,
        volume_dm3,
        used_volume_dm3: used,
        current_load_dm3: used,
        ...(labelOverride !== undefined && labelOverride.trim() !== ""
          ? { label: labelOverride.trim(), location_id: labelOverride.trim(), barcode_data: labelOverride.trim() }
          : {}),
        storage_type: storageType,
      };
    });
    onSave({ levels }, mergedBins);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[95vw] max-h-[90vh] h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-slate-800">Układ wewnętrzny – {getRackDisplayId(rack)}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">✕</button>
        </div>
        <p className="text-xs text-slate-500 px-5 py-1 shrink-0">Szerokość regału: {rackWidthCm} cm. Wysokość regału: {rack.height_cm} cm. Suma szerokości lokacji na każdym poziomie nie może przekroczyć szerokości regału; suma wysokości poziomów nie może przekroczyć wysokości regału.</p>
        {(heightExceeded || widthExceeded) && (
          <p className="text-sm font-semibold text-red-600 px-5 py-1 shrink-0" role="alert">
            {heightExceeded && `Suma wysokości poziomów (${totalHeightCm} cm) przekracza wysokość regału (${rack.height_cm} cm). `}
            {widthExceeded && "Suma szerokości lokacji na co najmniej jednym poziomie przekracza szerokość regału."}
          </p>
        )}
        <div className={`flex-1 min-h-0 flex flex-col p-5 ${fitsWithoutVerticalScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
          <div className={`flex flex-col gap-0 flex-1 min-h-0 ${fitsWithoutVerticalScroll ? "flex" : ""}`}>
            {/* Levels rendered top-to-bottom: highest level (Poziom L) at top, Poziom 1 at bottom */}
            {[...levels].reverse().map((lev, revIdx) => {
              const levIdx = levels.length - 1 - revIdx;
              const levelNumber = levIdx + 1;
              const totalW = totalWidth(lev);
              return (
                <div
                  key={levIdx}
                  className={`border-b-2 bg-slate-50/50 first:border-t-2 first:border-t-slate-300 flex flex-col min-h-0 ${fitsWithoutVerticalScroll ? "flex-1" : ""} ${revIdx < levels.length - 1 ? "border-b-orange-500" : "border-b-slate-300"}`}
                >
                  <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-200 bg-white/80 shrink-0">
                    <span className="text-xs font-bold text-slate-700">Poziom {levelNumber}</span>
                    <label className="text-[10px] text-slate-500 flex items-center gap-1">Wys. (cm): <input type="number" min={10} step={10} value={lev.height_cm} onChange={(e) => setLevelHeight(levIdx, Number(e.target.value))} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs bg-white" /></label>
                    <button type="button" onClick={() => removeLevel(levIdx)} className="text-red-600 text-xs font-semibold hover:underline">Usuń poziom</button>
                  </div>
                  <div className={`flex flex-nowrap gap-1 p-2 items-stretch flex-1 min-h-0 ${fitsWithoutHorizontalScroll ? "overflow-hidden" : "overflow-x-auto"}`}>
                    {lev.locations.map((loc, locIdx) => {
                      const displayLabel = getBinLabel(levIdx, locIdx);
                      const storageType = getBinStorageType(levIdx, locIdx);
                      const isReserve = storageType === "reserve";
                      const depthCm = loc.depth_cm ?? rack.length_cm;
                      const heightCm = loc.height_cm ?? lev.height_cm;
                      const volDm3 = binVolumeFromDimensions(loc.width_cm, depthCm, heightCm);
                      const technicalId = `Poziom ${levelNumber}, lokacja ${locIdx + 1}`;
                      const parseDim = (v: string) => {
                        const n = parseFloat(String(v).replace(",", "."));
                        return Number.isNaN(n) ? null : Math.max(10, n);
                      };
                      const handleDimChange = (setter: (a: number, b: number, c: number) => void, val: string) => {
                        const n = parseDim(val);
                        if (n !== null) setter(levIdx, locIdx, snapCm(n));
                      };
                      return (
                        <div
                          key={locIdx}
                          className={`relative flex flex-col rounded-xl border shadow-sm p-3 ${fitsWithoutHorizontalScroll ? "flex-1 min-w-0 min-h-[140px]" : "flex-shrink-0 min-w-[220px] min-h-[140px]"} ${isReserve ? "bg-amber-100 border-amber-300" : "bg-white border-slate-100"}`}
                        >
                          {/* Top-right: Usuń – compact */}
                          <div className="absolute right-1.5 top-1.5 z-10">
                            <button
                              type="button"
                              onClick={() => removeLocation(levIdx, locIdx)}
                              className="min-w-[28px] min-h-[26px] px-1.5 py-0.5 rounded-md bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold border border-red-200"
                              title="Usuń lokację"
                            >
                              Usuń
                            </button>
                          </div>

                          {/* Two columns: left = address + type, right = dimensions grid */}
                          <div className="flex gap-3 pr-14 flex-1 min-h-0">
                            {/* Left: address + Podstawowa/Rezerwa */}
                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                              <input
                                type="text"
                                value={displayLabel}
                                onChange={(e) => setBinLabel(levIdx, locIdx, e.target.value)}
                                placeholder="np. A1-A-1"
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold font-mono bg-white text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                title="Adres lokacji (edytowalny)"
                              />
                              <p className="text-[10px] text-slate-500 font-normal">{technicalId}</p>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[9px] text-slate-500 font-medium">Typ:</span>
                                <button
                                  type="button"
                                  onClick={() => setBinStorageType(levIdx, locIdx, "primary")}
                                  className={`text-[10px] px-2 py-1 rounded-md ${!isReserve ? "bg-blue-100 border border-blue-300 font-semibold text-blue-800" : "bg-slate-100 border border-slate-200 text-slate-600"}`}
                                  title="Lokacja podstawowa (kompletowanie)"
                                >
                                  Podstawowa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBinStorageType(levIdx, locIdx, "reserve")}
                                  className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 ${isReserve ? "bg-amber-200 border border-amber-400 font-semibold text-amber-900" : "bg-slate-100 border border-slate-200 text-slate-600"}`}
                                  title="Rezerwa (wyłączona z listy kompletowania)"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                  Rezerwa
                                </button>
                              </div>
                            </div>

                            {/* Right: 3x1 grid – W / D / H with text inputs and "cm" */}
                            <div className="flex flex-col gap-1.5 justify-start shrink-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-600 w-5">W:</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={loc.width_cm}
                                  onChange={(e) => handleDimChange(setLocationWidth, e.target.value)}
                                  className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-right bg-white"
                                  title="Szerokość (cm)"
                                />
                                <span className="text-[10px] text-slate-500">cm</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-600 w-5">D:</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={depthCm}
                                  onChange={(e) => handleDimChange(setLocationDepth, e.target.value)}
                                  className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-right bg-white"
                                  title="Głębokość (cm)"
                                />
                                <span className="text-[10px] text-slate-500">cm</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-600 w-5">H:</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={heightCm}
                                  onChange={(e) => handleDimChange(setLocationHeight, e.target.value)}
                                  className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-right bg-white"
                                  title="Wysokość (cm)"
                                />
                                <span className="text-[10px] text-slate-500">cm</span>
                              </div>
                              <p className="text-[10px] text-slate-600 font-medium mt-0.5">
                                Pojemność: {volDm3.toFixed(0)} dm³
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => addLocation(levIdx)} className="flex-shrink-0 text-xs text-blue-600 border-2 border-dashed border-blue-200 rounded-lg px-3 py-2 self-center hover:bg-blue-50">
                      + Lokacja
                    </button>
                  </div>
                  <p className={`text-[10px] px-3 py-1 ${totalW > (rackWidthCm ?? 0) + 0.01 ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                    Suma szer.: {totalW.toFixed(0)} cm {totalW > (rackWidthCm ?? 0) + 0.01 ? " (przekroczono)" : ""}
                  </p>
                </div>
              );
            })}
            <button type="button" onClick={addLevel} className="w-full py-2 rounded-b-lg border-2 border-dashed border-slate-300 text-slate-500 text-sm mt-1 hover:bg-slate-50 shrink-0">
              + Dodaj poziom
            </button>
          </div>
        </div>
        <div className="flex gap-2 justify-end px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700">Anuluj</button>
          <button type="button" onClick={handleSave} disabled={!valid} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">
            Zapisz układ
          </button>
        </div>
      </div>
    </div>
  );
}
