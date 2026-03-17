/**
 * Legend for the Warehouse Map (Magazyn) view.
 * Full Map: rack occupancy colors + summary stats.
 * Rack (side) view: slot-level legend (podręczna, rezerwa, wybrany slot, zajętość slotu).
 * Uses the same hex colors as the map and RackSideViewGrid (shared reserve style).
 */

import { RESERVE_BG, RESERVE_BORDER } from "./reserveLocationStyle";

const CELL_STROKE = "#cbd5e1";
const RESERVE_FILL = RESERVE_BG;
const RESERVE_STROKE = RESERVE_BORDER;
const SELECTED_FILL = "#eff6ff";
const SELECTED_STROKE = "#1d4ed8";
const OCCUPANCY_BG = "#e2e8f0";
const OCCUPANCY_LOW = "#22c55e";
const OCCUPANCY_MID = "#eab308";
const OCCUPANCY_HIGH = "#ef4444";
const RACK_LOW = "#0d9488";
const RACK_MID = "#eab308";
const RACK_HIGH = "#ef4444";

export type WarehouseLegendViewMode = "fullMap" | "rackDetail";

export type WarehouseLegendStats = {
  rackCount: number;
  usedDm3: number;
  totalDm3: number;
  primaryUsedDm3?: number;
  reserveUsedDm3?: number;
};

function formatVolume(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}

export type WarehouseLegendProps = {
  viewMode: WarehouseLegendViewMode;
  stats?: WarehouseLegendStats;
};

export function WarehouseLegend({ viewMode, stats }: WarehouseLegendProps) {
  const utilizationPct = stats && stats.totalDm3 > 0
    ? (stats.usedDm3 / stats.totalDm3) * 100
    : 0;

  return (
    <div
      className="sticky bottom-0 z-10 shrink-0 flex flex-col bg-white/95 backdrop-blur-sm border-t border-slate-200 rounded-b-xl shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      role="img"
      aria-label="Legenda mapy magazynu"
    >
      {stats != null && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 px-4 py-2 border-b border-slate-100 bg-slate-50/80 text-xs text-slate-600">
          <span>Liczba regałów: <strong className="text-slate-800">{stats.rackCount}</strong></span>
          <span>Łączna zajętość: <strong className="font-mono text-slate-800">{formatVolume(stats.usedDm3)}</strong> / <strong className="font-mono text-slate-800">{formatVolume(stats.totalDm3)}</strong> dm³</span>
          {stats.primaryUsedDm3 != null && (
            <span>Podstawowa zajętość: <strong className="font-mono text-slate-800">{formatVolume(stats.primaryUsedDm3)}</strong> dm³</span>
          )}
          {stats.reserveUsedDm3 != null && (
            <span>Rezerwa zajętość: <strong className="font-mono text-slate-800">{formatVolume(stats.reserveUsedDm3)}</strong> dm³</span>
          )}
          <span>Wykorzystanie: <strong className="text-slate-800">{utilizationPct.toFixed(1)}%</strong></span>
        </div>
      )}
      <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-2.5">
        {viewMode === "fullMap" && (
          <>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded shrink-0"
                style={{ backgroundColor: RACK_LOW, border: `1px solid ${CELL_STROKE}` }}
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">Regał z dużą ilością wolnego miejsca</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded shrink-0 border"
                style={{ backgroundColor: RACK_MID, borderColor: "#ca8a04" }}
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">Regał zapełniony w ponad 70%</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded shrink-0 border"
                style={{ backgroundColor: RACK_HIGH, borderColor: "#b91c1c" }}
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">Regał krytycznie pełny (&gt;90%)</span>
            </div>
          </>
        )}
        {viewMode === "rackDetail" && (
          <>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded border shrink-0"
                style={{ backgroundColor: "#f8fafc", borderColor: CELL_STROKE, borderWidth: 1 }}
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">Lokalizacja Podręczna</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded border shrink-0 flex items-center justify-center"
                style={{ backgroundColor: RESERVE_FILL, borderColor: RESERVE_STROKE, borderWidth: 1 }}
              >
                <span className="text-[10px]" aria-hidden>🔒</span>
              </span>
              <span className="text-xs text-slate-600 whitespace-nowrap">Lokalizacja Zapasowa (Rezerwa)</span>
            </div>
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
    </div>
  );
}
