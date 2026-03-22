import type { Dispatch, SetStateAction } from "react";
import { useRef } from "react";
import { useWheelScrollBoundaryContain } from "../../hooks/useWheelScrollBoundaryContain";
import type { RackState, LayoutState } from "./warehouseTypes";
import { getLevelConfig, getTotalLocations, getRackDisplayId, binsToLevels } from "./warehouseUtils";
import { UI_STRINGS } from "../../constants/uiStrings";

export type RackPropertiesSidebarProps = {
  /** Used for row direction-aware rack labels. */
  layout: LayoutState;
  selectedRack: RackState | null;
  selectedRacks: RackState[];
  isMultiSelect: boolean;
  selectedRackIds: Array<number | string>;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setShowElevationForRackId: (id: number | string | null) => void;
  setInternalLayoutRackId: (id: number | string | null) => void;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: (ids: Array<number | string>) => void;
  routeRackIds: string[];
  routeRackLabels: string[];
  routeLengthMeters: number;
  routeLegMeters?: number;
  routeStepIndex?: number;
  routeStepCount?: number;
  onRouteStepNext?: () => void;
  isRouteActive: boolean;
  clearRoute: () => void;
  optimizeRoute: () => void;
  finishRoute: () => void;
};

export function RackPropertiesSidebar({
  layout,
  selectedRack,
  selectedRacks,
  isMultiSelect,
  selectedRackIds,
  setLayout,
  setShowElevationForRackId,
  setInternalLayoutRackId,
  setSelectedRackId,
  setSelectedRackIds,
  routeRackIds,
  routeRackLabels,
  routeLengthMeters,
  routeLegMeters = 0,
  routeStepIndex = 0,
  routeStepCount = 0,
  onRouteStepNext,
  isRouteActive,
  clearRoute,
  optimizeRoute,
  finishRoute,
}: RackPropertiesSidebarProps) {
  const asideScrollRef = useRef<HTMLElement>(null);
  const scrollKey = `${selectedRack?.id ?? selectedRack?.rack_index ?? ""}-${routeStepIndex}-${isRouteActive}-${selectedRackIds.join(",")}`;
  useWheelScrollBoundaryContain(asideScrollRef, true, scrollKey);

  return (
    <aside
      ref={asideScrollRef}
      className="flex h-full min-h-0 w-[320px] flex-none flex-col self-stretch overflow-y-auto overscroll-y-contain rounded-xl border border-slate-100 bg-white p-3 shadow-md"
      style={{ overscrollBehavior: "contain" }}
    >
      <h2 className="text-xs font-black uppercase text-slate-600 mb-2">{UI_STRINGS.warehouse.rackProperties.title}</h2>
      {selectedRack && isMultiSelect ? (
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
          {selectedRack ? (
            <p className="text-[#1E293B] font-semibold">{getRackDisplayId(selectedRack, layout)}</p>
          ) : (
            <p className="text-[#1E293B] font-semibold">Brak wybranego regalu</p>
          )}
          {selectedRack && (
            <>
          <dl className="text-[11px] text-slate-500 mt-2 space-y-0.5">
            <dt className="text-slate-500">Wymiary</dt>
            <dd className="text-slate-700">{selectedRack.width_cm} × {selectedRack.length_cm} × {selectedRack.height_cm} cm</dd>
            <dt className="text-slate-500">{UI_STRINGS.warehouse.rackProperties.levelsBins}</dt>
            <dd className="text-slate-700">
              {(() => {
                const lc = getLevelConfig(selectedRack);
                const total = getTotalLocations(lc);
                return lc.every((r) => r.locations === lc[0].locations)
                  ? `${lc.length} / ${lc[0]?.locations ?? 0}`
                  : `${lc.length} poz., Suma: ${total} lok.`;
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
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Trasa kompletacji</p>
            {routeRackIds.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                {isRouteActive
                  ? "Tryb aktywny — kliknij pierwszy regał"
                  : "Włącz „Planuj trasę” w pasku, aby ustawić kolejność regałów."}
              </p>
            ) : (
              <>
                {isRouteActive && routeRackIds.length === 1 && (
                  <p className="text-[11px] text-slate-600 mb-1.5">Kliknij kolejny regał, aby kontynuować</p>
                )}
                {routeRackIds.length >= 2 && (
                  <p className="text-[11px] text-slate-600 mb-1">
                    Krok:{" "}
                    <span className="font-semibold text-slate-800">
                      {routeStepIndex + 1} / {routeStepCount}
                    </span>
                  </p>
                )}
                {routeRackIds.length >= 2 && (
                  <p className="text-[11px] text-slate-600 mb-1">
                    Odcinek: <span className="font-semibold text-slate-700">{routeLegMeters.toFixed(1)} m</span>
                  </p>
                )}
                <p className="text-[11px] text-slate-600 mb-1">
                  Całość: <span className="font-semibold text-slate-700">{routeLengthMeters.toFixed(1)} m</span>
                </p>
                <ul className="max-h-28 overflow-y-auto space-y-1">
                  {routeRackLabels.map((label, idx) => (
                    <li
                      key={`${label}-${idx}`}
                      className={`text-[11px] rounded px-1.5 py-0.5 ${
                        routeRackIds.length >= 2 && idx === routeStepIndex ? "bg-blue-50 text-blue-900 font-semibold ring-1 ring-blue-200" : "text-slate-700"
                      }`}
                    >
                      <span className="inline-flex items-center justify-center w-4 h-4 mr-1 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
                {routeRackIds.length >= 2 && onRouteStepNext != null && (
                  <button
                    type="button"
                    onClick={onRouteStepNext}
                    disabled={routeStepIndex >= routeStepCount - 1}
                    className="mt-2 w-full px-2 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Następny krok
                  </button>
                )}
                <div className="mt-2 flex gap-1.5">
                  <button type="button" onClick={clearRoute} className="px-2 py-1 rounded border border-slate-300 text-[11px] hover:bg-slate-50">
                    Wyczyść trasę
                  </button>
                  <button type="button" onClick={finishRoute} className="px-2 py-1 rounded border border-slate-300 text-[11px] hover:bg-slate-50">
                    Zakończ
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
      <div className="flex flex-col gap-1.5 mt-3">
        {selectedRack && (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
