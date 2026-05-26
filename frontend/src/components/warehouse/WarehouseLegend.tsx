/**
 * Legend for the Warehouse Map (Magazyn) view.
 * Full Map: rack occupancy colors + summary stats.
 * Rack (side) view: slot-level legend (podręczna, rezerwa, wybrany slot, zajętość slotu).
 * Uses the same hex colors as the map and RackSideViewGrid (shared reserve style).
 */

import type { StorageType } from "../../types/warehouse";
import { StorageTypeIcon } from "../../utils/storageTypeIcons";
import { getStorageTypeLabel } from "../../utils/storageTypes";

const SELECTED_FILL = "#eff6ff";
const SELECTED_STROKE = "#1d4ed8";
const OCCUPANCY_BG = "#e2e8f0";
const OCCUPANCY_LOW = "#22c55e";
const OCCUPANCY_MID = "#eab308";
const OCCUPANCY_HIGH = "#ef4444";

export type WarehouseLegendViewMode = "fullMap" | "rackDetail";

export type WarehouseLegendStats = {
  rackCount: number;
  usedDm3: number;
  totalDm3: number;
  primaryUsedDm3?: number;
  reserveUsedDm3?: number;
  damagedUsedDm3?: number;
};

export type WarehouseLegendProps = {
  viewMode: WarehouseLegendViewMode;
  stats?: WarehouseLegendStats;
  /** In rack detail mode show only actually used types in current rack. */
  usedStorageTypes?: StorageType[];
  /** In full map mode: warehouse-wide location counts by storage type. */
  globalLocationStats?: {
    primary: number;
    reserve: number;
    damaged: number;
    total: number;
  };
};

const STORAGE_TYPE_ORDER: StorageType[] = ["primary", "reserve", "damaged"];

export function WarehouseLegend({ viewMode, stats, usedStorageTypes = [], globalLocationStats }: WarehouseLegendProps) {
  void stats;
  void globalLocationStats;

  return (
    <div
      className="sticky bottom-0 z-10 shrink-0 flex flex-col bg-white/95 backdrop-blur-sm border-t border-slate-200 rounded-b-xl shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      role="img"
      aria-label="Legenda mapy magazynu"
    >
      <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pt-2.5">
        {viewMode === "fullMap" && (
          <div className="w-full h-10" />
        )}
        {viewMode === "rackDetail" && (
          <>
            <div className="w-full text-[11px] font-semibold text-slate-500 uppercase text-center mb-0.5">Widok / filtry</div>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded shrink-0 border-2"
                style={{ backgroundColor: SELECTED_FILL, borderColor: SELECTED_STROKE }}
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">Wybrany regał/slot</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-14 h-3 rounded shrink-0 overflow-hidden flex"
                style={{ backgroundColor: OCCUPANCY_BG }}
                aria-hidden
              >
                <span style={{ width: "33%", backgroundColor: OCCUPANCY_LOW }} />
                <span style={{ width: "34%", backgroundColor: OCCUPANCY_MID }} />
                <span style={{ width: "33%", backgroundColor: OCCUPANCY_HIGH }} />
              </span>
              <span className="text-xs text-slate-600 whitespace-nowrap">Zajętość slotu (%)</span>
            </div>
          </>
        )}
      </div>
      {viewMode === "rackDetail" && usedStorageTypes.length > 0 && (
        <div className="shrink-0 px-4 pb-3 pt-2 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1.5 text-center">Typy lokalizacji</div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {STORAGE_TYPE_ORDER.filter((t) => usedStorageTypes.includes(t)).map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <StorageTypeIcon storageType={type} size={14} className="text-slate-600" />
                <span className="text-xs text-slate-600 whitespace-nowrap">{getStorageTypeLabel(type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
