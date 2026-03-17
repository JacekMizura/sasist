import type { Dispatch, SetStateAction } from "react";
import type { RackState, LayoutState } from "./warehouseTypes";
import { getLevelConfig, getTotalLocations, getRackDisplayId, binsToLevels } from "./warehouseUtils";
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
}: RackPropertiesSidebarProps) {
  return (
    <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-slate-100 bg-white p-3 overflow-y-auto shadow-md"
      >
      <h2 className="text-xs font-black uppercase text-slate-600 mb-2">{UI_STRINGS.warehouse.rackProperties.title}</h2>
      {isMultiSelect ? (
        <>
          <p className="text-[#1E293B] text-sm font-semibold">Wybrano: {selectedRacks.length} regałów</p>
          <div className="mt-2 space-y-2">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase">Wysokość (cm)</label>
              <p className="text-[11px] text-slate-700 mt-0.5">
                {(() => {
                  const heights = selectedRacks.map((r) => r.height_cm);
                  const allSame = heights.every((h) => h === heights[0]);
                  return allSame ? heights[0] : "różne";
                })()}
              </p>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase">Poziomy</label>
              <p className="text-[11px] text-slate-700 mt-0.5">
                {(() => {
                  const levels = selectedRacks.map((r) => r.levels);
                  const allSame = levels.every((l) => l === levels[0]);
                  return allSame ? levels[0] : "różne";
                })()}
              </p>
            </div>
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
          {/* Lokalizacje zgrupowane po poziomie */}
          {(() => {
            const levels = selectedRack.rackLevels ?? (selectedRack.bins?.length ? binsToLevels(selectedRack.bins) : []);
            if (levels.length === 0) return null;
            return (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Lokalizacje</p>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {levels.map((lev) => (
                    <div key={lev.levelIndex} className="text-[10px]">
                      <p className="font-semibold text-slate-600 mb-0.5">Poziom {lev.levelIndex}</p>
                      <div className="pl-2 space-y-0.5">
                        {lev.positions.map((pos, posIndex) => (
                          <div key={pos.locationUUID} className="font-mono text-slate-700 truncate" title={pos.locationUUID}>
                            {pos.locationAddress || pos.locationUUID || `Pozycja ${posIndex + 1}`}
                          </div>
                        ))}
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
