import { Eye, Pencil, Trash2 } from "lucide-react";

import { PROPORTIONAL_TABLE_SYSTEM_WIDTHS } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import { FleetResourceActionBar, FleetResourceActionButton } from "../../../modules/fleetResource/FleetResourceActionBar";
import { FleetResourceProgressBar } from "../../../modules/fleetResource/FleetResourceProgressBar";
import {
  racksListActionsCellClass,
  racksListActionsThClass,
  racksListNameCellClass,
  racksListNameThClass,
  racksListRowClass,
  racksListRowInnerClass,
  racksListTableClass,
  racksListTdClass,
  racksListThClass,
  racksListThRightClass,
} from "./racksListTableTokens";

const DYNAMIC_COLUMNS = ["warehouse", "segments", "free", "occupied", "utilization"] as const;
const TABLE_LAYOUT = { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, checkboxPx: 0, logoPx: 0, actionsPx: 120 };

export type ConsolidationRackListRow = {
  id: number;
  name: string;
  warehouseName: string;
  stats: {
    total: number;
    free: number;
    occupied: number;
    utilizationPercent: number;
  };
};

export type ConsolidationRacksListTableProps = {
  rows: ConsolidationRackListRow[];
  deleteBusyId: number | null;
  onPreview: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (row: ConsolidationRackListRow) => void;
};

function DynamicCell({ row, columnId }: { row: ConsolidationRackListRow; columnId: (typeof DYNAMIC_COLUMNS)[number] }) {
  const inner = `${racksListRowInnerClass} min-w-0`;
  switch (columnId) {
    case "warehouse":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-800">{row.warehouseName}</span>
        </div>
      );
    case "segments":
      return <div className={`${inner} justify-end tabular-nums text-slate-800`}>{row.stats.total}</div>;
    case "free":
      return (
        <div className={`${inner} justify-end tabular-nums font-medium text-emerald-800`}>{row.stats.free}</div>
      );
    case "occupied":
      return (
        <div className={`${inner} justify-end tabular-nums font-medium text-orange-800`}>{row.stats.occupied}</div>
      );
    case "utilization":
      return (
        <div className={`${inner} justify-end gap-2`}>
          <FleetResourceProgressBar percent={row.stats.utilizationPercent} className="max-w-[88px]" />
        </div>
      );
    default:
      return <div className={inner}>—</div>;
  }
}

export function ConsolidationRacksListTable({
  rows,
  deleteBusyId,
  onPreview,
  onEdit,
  onDelete,
}: ConsolidationRacksListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    DYNAMIC_COLUMNS.length,
    TABLE_LAYOUT,
  );

  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={racksListTableClass} style={tableStyle}>
        <colgroup>
          <col style={{ width: widths.name }} />
          {DYNAMIC_COLUMNS.map((colId) => (
            <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
          ))}
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={racksListNameThClass}>Nazwa</th>
            <th className={racksListThClass}>Magazyn</th>
            <th className={racksListThRightClass}>Segmentów</th>
            <th className={racksListThRightClass}>Wolne</th>
            <th className={racksListThRightClass}>Zajęte</th>
            <th className={racksListThRightClass}>Średnie wykorzystanie</th>
            <th className={racksListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={racksListRowClass} onDoubleClick={() => onPreview(row.id)}>
              <td className={racksListNameCellClass}>
                <div className={`${racksListRowInnerClass} min-w-0`}>
                  <span className="block max-w-full truncate font-mono text-sm font-semibold text-slate-900" title={row.name}>
                    {row.name}
                  </span>
                </div>
              </td>
              {DYNAMIC_COLUMNS.map((colId) => (
                <td key={colId} className={racksListTdClass}>
                  <DynamicCell row={row} columnId={colId} />
                </td>
              ))}
              <td className={racksListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                <div className={`${racksListRowInnerClass} justify-center`}>
                  <FleetResourceActionBar aria-label="Akcje regału">
                    <FleetResourceActionButton onClick={() => onPreview(row.id)} title="Podgląd regału" aria-label="Podgląd regału">
                      <Eye strokeWidth={2} aria-hidden />
                    </FleetResourceActionButton>
                    <FleetResourceActionButton onClick={() => onEdit(row.id)} title="Edytuj regał" aria-label="Edytuj regał">
                      <Pencil strokeWidth={2} aria-hidden />
                    </FleetResourceActionButton>
                    <FleetResourceActionButton
                      variant="danger"
                      disabled={deleteBusyId === row.id}
                      onClick={() => onDelete(row)}
                      title="Usuń regał"
                      aria-label="Usuń regał"
                    >
                      <Trash2 strokeWidth={2} aria-hidden />
                    </FleetResourceActionButton>
                  </FleetResourceActionBar>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
