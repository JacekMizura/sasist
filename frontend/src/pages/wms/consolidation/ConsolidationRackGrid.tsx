import type { ConsolidationRackSegmentDashboard } from "../../../api/wmsConsolidationApi";
import { rackSegmentStateClass } from "./consolidationRackDashboardUi";
import {
  configSegmentTone,
  levelsToGrid,
  type RackGridLevel,
} from "./rackLayoutUtils";

export type RackGridSegmentClick = {
  segmentId?: number;
  shelfLabel: string;
  slotLabel: string;
  slotLabelCustom?: string | null;
  columnName: string | null;
  rowNumber: number;
  orderId: number | null;
  orderNumber: string | null;
  fillPercent?: number;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  capacityDm3?: number | null;
  orderVolumeDm3?: number | null;
  utilizationPercent?: number | null;
  capacityOverflow?: boolean;
  dimensionEstimated?: boolean;
  estimatedItemsCount?: number;
  state?: string;
};

type Props = {
  rackName: string;
  levels: RackGridLevel[];
  /** Dashboard segments keyed by segment_id for operational colors */
  dashboardBySegmentId?: Map<number, ConsolidationRackSegmentDashboard>;
  onSegmentClick?: (cell: RackGridSegmentClick) => void;
  compact?: boolean;
};

function cellTone(
  seg: { id?: number; order_id: number | null },
  dashboardBySegmentId?: Map<number, ConsolidationRackSegmentDashboard>,
): string {
  if (seg.id != null && dashboardBySegmentId?.has(seg.id)) {
    return rackSegmentStateClass(dashboardBySegmentId.get(seg.id)!.state);
  }
  return configSegmentTone(seg.order_id);
}

export default function ConsolidationRackGrid({
  rackName,
  levels,
  dashboardBySegmentId,
  onSegmentClick,
  compact = false,
}: Props) {
  const { columnLetters, rowCount, cells } = levelsToGrid(levels);
  if (rowCount === 0 || columnLetters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
        Brak półek w regale.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse text-center">
        <thead>
          <tr>
            <th className="w-10 p-1 text-[10px] font-bold uppercase text-slate-400" />
            {columnLetters.map((letter) => (
              <th key={letter} className="p-1 text-sm font-bold text-slate-700">
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((row, rowIdx) => (
            <tr key={rowIdx}>
              <td className="p-1 text-xs font-bold tabular-nums text-slate-500">{rowIdx + 1}</td>
              {row.map((cell, colIdx) => {
                if (!cell) {
                  return (
                    <td key={colIdx} className="p-1">
                      <div className="min-h-[3rem] rounded-md border border-dashed border-slate-100 bg-slate-50/50" />
                    </td>
                  );
                }
                const dash = cell.id != null ? dashboardBySegmentId?.get(cell.id) : undefined;
                const shelfLabel = `${rackName}/${cell.slotLabel}`;
                return (
                  <td key={colIdx} className="p-1">
                    <button
                      type="button"
                      onClick={() =>
                        onSegmentClick?.({
                          segmentId: cell.id,
                          shelfLabel,
                          slotLabel: cell.slotLabel,
                          slotLabelCustom: cell.slot_label,
                          columnName: cell.level.name,
                          rowNumber: rowIdx + 1,
                          orderId: cell.order_id,
                          orderNumber: cell.order_number ?? dash?.order_number ?? null,
                          fillPercent: cell.fill_percent ?? dash?.fill_percent,
                          lengthMm: cell.length_mm,
                          widthMm: cell.width_mm,
                          heightMm: cell.height_mm,
                          capacityDm3: cell.capacity_dm3 ?? dash?.capacity_dm3,
                          orderVolumeDm3: cell.order_volume_dm3 ?? dash?.order_volume_dm3,
                          utilizationPercent: cell.utilization_percent ?? dash?.utilization_percent,
                          capacityOverflow: cell.capacity_overflow ?? dash?.capacity_overflow,
                          dimensionEstimated: cell.dimension_estimated ?? dash?.dimension_estimated,
                          estimatedItemsCount: cell.estimated_items_count ?? dash?.estimated_items_count,
                          state: dash?.state,
                        })
                      }
                      className={`flex min-h-[3.25rem] w-full flex-col items-center justify-center rounded-lg border px-1 py-1.5 transition ${cellTone(cell, dashboardBySegmentId)} ${compact ? "min-h-[2.75rem] text-[10px]" : "text-xs"}`}
                    >
                      <span className="font-mono font-bold leading-tight">{cell.slotLabel}</span>
                      {!compact && (
                        <span className="mt-0.5 font-mono text-[9px] opacity-70">{shelfLabel}</span>
                      )}
                      {(cell.order_number ?? dash?.order_number) ? (
                        <span className="mt-1 truncate max-w-full text-[10px] font-semibold">
                          {cell.order_number ?? dash?.order_number}
                        </span>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
