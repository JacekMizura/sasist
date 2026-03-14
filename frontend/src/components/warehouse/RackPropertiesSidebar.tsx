import type { Dispatch, SetStateAction } from "react";
import type { RackState, LayoutState } from "./warehouseTypes";
import { snapCm, volumePerBin, volumePerBinFromTotal, createBinsForRack, binsToLevels, getLevelConfig, getTotalLocations, getRackDisplayId, ROW_LABEL_ADDRESS_PATTERN } from "./warehouseUtils";
import { GRID_UNIT_CM } from "./warehouseTypes";
import { UI_STRINGS } from "../../constants/uiStrings";

export type RackPropertiesSidebarProps = {
  selectedRack: RackState;
  selectedRacks: RackState[];
  isMultiSelect: boolean;
  selectedRackIds: Array<number | string>;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setShowElevationForRackId: (id: number | string | null) => void;
  setInternalLayoutRackId: (id: number | string | null) => void;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: (ids: Array<number | string>) => void;
  setClipboard: (racks: RackState[]) => void;
  clipboard: RackState[];
  cursorCm: { x: number; y: number } | null;
};

export function RackPropertiesSidebar({
  selectedRack,
  selectedRacks,
  isMultiSelect,
  selectedRackIds,
  setLayout,
  setShowElevationForRackId,
  setInternalLayoutRackId,
  setSelectedRackId,
  setSelectedRackIds,
  setClipboard,
  clipboard,
  cursorCm,
}: RackPropertiesSidebarProps) {
  return (
    <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-slate-100 bg-white p-3 overflow-y-auto shadow-md"
      >
      <h2 className="text-xs font-black uppercase text-slate-600 mb-2">{UI_STRINGS.warehouse.rackProperties.title}</h2>
      {isMultiSelect ? (
        <>
          <p className="text-[#1E293B] text-sm font-semibold">Wybrano: {selectedRacks.length} regałów</p>
          <div className="mt-2 space-y-2">
            <label className="block text-[10px] text-slate-500 uppercase">Wysokość (cm) – wszystkie</label>
            <input
              type="number"
              min={10}
              step={10}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
              placeholder="np. 200"
              onBlur={(e) => {
                const v = snapCm(Number(e.target.value) || 0);
                if (v > 0) setLayout((prev) => ({ ...prev, racks: prev.racks.map((r) => (selectedRackIds.includes(r.id ?? r.rack_index) ? { ...r, height_cm: v } : r)) }));
              }}
            />
            <label className="block text-[10px] text-slate-500 uppercase">Poziomy – wszystkie</label>
            <input
              type="number"
              min={1}
              max={20}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
              placeholder="np. 4"
              onBlur={(e) => {
                const v = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                setLayout((prev) => ({
                  ...prev,
                  racks: prev.racks.map((r) => {
                    if (!selectedRackIds.includes(r.id ?? r.rack_index)) return r;
                    const volPerBinVal = volumePerBin(r.width_cm, r.length_cm, r.height_cm, v, r.bins_per_level);
                    const rAny = r as { addressPattern?: string; rowId?: string; sectionStartIndex?: number; binNamingType?: "numeric" | "alpha" };
                    const bins = createBinsForRack(
                      r.aisle_letter,
                      r.rack_index,
                      v,
                      r.bins_per_level,
                      volPerBinVal,
                      "M1",
                      undefined,
                      r.width_cm,
                      r.length_cm,
                      r.height_cm,
                      undefined,
                      rAny.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
                      rAny.rowId ?? r.name,
                      rAny.sectionStartIndex ?? 1,
                      rAny.binNamingType ?? "numeric",
                      getLevelConfig({ ...r, levels: v })
                    );
                    return { ...r, levels: v, bins, rackLevels: binsToLevels(bins) };
                  }),
                }));
              }}
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-[#1E293B] font-semibold">{getRackDisplayId(selectedRack)}</p>
          <dl className="text-[11px] text-slate-500 mt-2 space-y-0.5">
            <dt className="text-slate-500">Wymiary</dt>
            <dd className="text-slate-700">{selectedRack.width_cm} × {selectedRack.length_cm} × {selectedRack.height_cm} cm</dd>
            <dt className="text-slate-500">{UI_STRINGS.warehouse.rackProperties.levelsBins}</dt>
            <dd className="text-slate-700">
              {(() => {
                const lc = getLevelConfig(selectedRack);
                const total = getTotalLocations(lc);
                return lc.every((r) => r.locations === lc[0].locations)
                  ? `${selectedRack.levels} / ${selectedRack.bins_per_level}`
                  : `${selectedRack.levels} poz., Suma: ${total} lok.`;
              })()}
            </dd>
          </dl>
          <label className="flex items-center gap-2 mt-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={selectedRack.show_label !== false}
              onChange={(e) => {
                const v = e.target.checked;
                setLayout((prev) => ({
                  ...prev,
                  racks: prev.racks.map((rack) =>
                    (rack.id ?? rack.rack_index) === (selectedRack.id ?? selectedRack.rack_index) ? { ...rack, show_label: v } : rack
                  ),
                }));
              }}
              className="rounded"
            />
            Pokaż etykietę na mapie
          </label>
          <p className="text-[10px] text-slate-500 mt-1">Przeciągnij na planie, aby przenieść.</p>
          {/* Poziomy i pozycje: lista lokacji z ID i zajętością */}
          {(() => {
            const levels = selectedRack.rackLevels ?? (selectedRack.bins?.length ? binsToLevels(selectedRack.bins) : []);
            if (levels.length === 0) return null;
            return (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Lokacje (poziom → pozycja)</p>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {levels.map((lev) => (
                    <div key={lev.levelIndex} className="text-[10px]">
                      <span className="font-semibold text-slate-600">Poziom {lev.levelIndex}</span>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-0.5 pl-2">
                        {lev.positions.map((pos) => {
                          const vol = pos.volume_dm3 ?? 0;
                          const used = pos.used_volume_dm3 ?? 0;
                          const pct = vol > 0 ? Math.min(100, Math.round((used / vol) * 100)) : 0;
                          return (
                            <div key={pos.locationUUID} className="flex items-center justify-between border-b border-slate-50 pb-0.5">
                              <span className="font-mono text-slate-700 truncate" title={pos.locationUUID}>{pos.locationAddress || pos.locationUUID}</span>
                              <span className={`shrink-0 text-[9px] ${pct > 0 ? "text-amber-600" : "text-slate-400"}`}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}
      <div className="flex flex-col gap-1.5 mt-3">
        <button type="button" onClick={() => setShowElevationForRackId(selectedRack.id ?? selectedRack.rack_index)} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500">Widok z boku</button>
        <button type="button" onClick={() => setInternalLayoutRackId(selectedRack.id ?? selectedRack.rack_index)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-[#1E293B] text-xs font-semibold hover:bg-slate-200 border border-[#E2E8F0]">Układ wewnętrzny</button>
        <button type="button" onClick={() => setClipboard(selectedRacks)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-[#1E293B] text-xs font-semibold hover:bg-slate-200 border border-[#E2E8F0]">Kopiuj (Ctrl+C)</button>
        <button
          type="button"
          onClick={() => {
            if (clipboard.length && cursorCm != null) {
              const cx = Math.round(cursorCm.x / GRID_UNIT_CM);
              const cy = Math.round(cursorCm.y / GRID_UNIT_CM);
              setLayout((prev) => ({
                ...prev,
                racks: [
                  ...prev.racks,
                  ...clipboard.map((r, i) => {
                    const lc = getLevelConfig(r);
                    const total = getTotalLocations(lc);
                    const volPerBinVal = total > 0 ? volumePerBinFromTotal(r.width_cm, r.length_cm, r.height_cm, total) : volumePerBin(r.width_cm, r.length_cm, r.height_cm, r.levels, r.bins_per_level);
                    const rAny = r as { addressPattern?: string; rowId?: string; sectionStartIndex?: number; binNamingType?: "numeric" | "alpha" };
                    const bins = createBinsForRack(
                      r.aisle_letter,
                      prev.racks.length + i + 1,
                      r.levels,
                      r.bins_per_level,
                      volPerBinVal,
                      "M1",
                      undefined,
                      r.width_cm,
                      r.length_cm,
                      r.height_cm,
                      undefined,
                      rAny.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
                      rAny.rowId ?? r.name,
                      rAny.sectionStartIndex ?? 1,
                      rAny.binNamingType ?? "numeric",
                      lc
                    );
                    return { ...r, id: undefined, x: cx + (i % 3) * (r.width + 1), y: cy + Math.floor(i / 3) * (r.height + 1), rack_index: prev.racks.length + i + 1, bins, rackLevels: binsToLevels(bins) };
                  }),
                ],
              }));
            }
          }}
          className="px-3 py-1.5 rounded-lg bg-slate-100 text-[#1E293B] text-xs font-semibold hover:bg-slate-200 border border-[#E2E8F0]"
        >
          Wklej (Ctrl+V)
        </button>
        <button type="button" onClick={() => { setSelectedRackId(null); setSelectedRackIds([]); }} className="px-3 py-1.5 rounded-lg bg-slate-100 text-[#1E293B] text-xs font-semibold hover:bg-slate-200 border border-[#E2E8F0]">Odznacz</button>
        <button
          type="button"
          onClick={() => {
            const ids = new Set(selectedRackIds);
            setLayout((prev) => ({ ...prev, racks: prev.racks.filter((r) => !ids.has(r.id ?? r.rack_index)) }));
            setSelectedRackId(null);
            setSelectedRackIds([]);
          }}
          className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 border border-red-200"
        >
          Usuń wybrane
        </button>
      </div>
    </aside>
  );
}
