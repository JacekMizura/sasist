import type { BinState, RackState } from "../../../types/warehouse";

export interface MagazynRackDetailHeaderProps {
  rack: RackState | null | undefined;
  onBackToMap: () => void;
  formatVolume: (n: number) => string;
  binUsedVolumeDm3: (b: BinState) => number;
  binVolumeDm3: (b: BinState, r: RackState) => number;
  getRackDisplayId: (r: RackState) => string;
  onShowLabelDownload?: () => void;
  /** Clear all product assignments (assigned_locations) for bins on this rack; parent shows confirmation. */
  onEmptyRack?: () => void;
  /** Disable "Opróżnij regał" (e.g. operation in progress). */
  emptyRackDisabled?: boolean;
  /** Hide the button when there is nothing to clear (no assigned_locations on this rack). */
  hideEmptyRackButton?: boolean;
}

export function MagazynRackDetailHeader({
  rack,
  onBackToMap,
  formatVolume,
  binUsedVolumeDm3,
  binVolumeDm3,
  getRackDisplayId,
  onShowLabelDownload,
  onEmptyRack,
  emptyRackDisabled,
  hideEmptyRackButton,
}: MagazynRackDetailHeaderProps) {
  const used = rack ? rack.bins.reduce((s, b) => s + binUsedVolumeDm3(b), 0) : 0;
  const total = rack ? (rack.total_capacity_dm3 ?? rack.bins.reduce((s, b) => s + binVolumeDm3(b, rack), 0)) : 0;
  const occupancyPct = total > 0 ? (used / total) * 100 : 0;
  const rackIdLabel = rack ? getRackDisplayId(rack) : "";

  return (
    <div className="shrink-0 flex items-center gap-3 p-3 border-b border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBackToMap}
          className="flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:underline"
        >
          <span aria-hidden>←</span> Powrót do mapy
        </button>
        {rack && onShowLabelDownload && (
          <button
            type="button"
            onClick={onShowLabelDownload}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500"
          >
            Pobierz etykiety
          </button>
        )}
        {rack && onEmptyRack && !hideEmptyRackButton && (
          <button
            type="button"
            onClick={onEmptyRack}
            disabled={emptyRackDisabled}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Opróżnij regał
          </button>
        )}
      </div>
      {rack && (
        <>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-bold text-slate-600 uppercase shrink-0">REGAŁ {rackIdLabel} – ZAJĘTOŚĆ</span>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm font-mono text-[#1E293B] shrink-0">{formatVolume(used)} / {formatVolume(total)} dm³</span>
            <div className="flex-1 min-w-0 h-2.5 rounded-full bg-slate-200 overflow-hidden max-w-xs">
              <div
                className={`h-full rounded-full transition-all ${occupancyPct <= 50 ? "bg-emerald-500" : occupancyPct <= 80 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(100, occupancyPct)}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
