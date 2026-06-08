import { memo } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import type { InventoryTaskCompact } from "../../../api/inventoryCountApi";
import { TASK_ROW_HEIGHT, WMS_INV } from "../wmsIndustrialTheme";

type TaskRowProps = {
  task: InventoryTaskCompact;
  active?: boolean;
  onSelect: () => void;
};

function formatActivity(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function TaskRowInner({ task, active, onSelect }: TaskRowProps) {
  const loc = task.location_code ?? task.location_name ?? `#${task.location_id}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ height: TASK_ROW_HEIGHT }}
      className={`grid w-full grid-cols-[minmax(0,1.4fr)_72px_88px_72px_88px_1fr] items-center gap-2 border-b ${WMS_INV.border} px-3 text-left text-sm font-semibold ${WMS_INV.text} ${
        active ? WMS_INV.rowActive : WMS_INV.rowHover
      }`}
    >
      <span className="truncate font-bold">{loc}</span>
      <span className="tabular-nums">{task.progress_percent}%</span>
      <span className="truncate text-xs font-medium text-[#5a6b7d]">{task.assigned_operator_name ?? "—"}</span>
      <span className="text-xs uppercase">{task.status}</span>
      <span className="flex items-center gap-1">
        {task.has_variance ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${WMS_INV.warning}`}>Różn.</span>
        ) : null}
        {task.recount_flag ? <RotateCcw className="h-3.5 w-3.5 text-[#b45309]" aria-hidden /> : null}
        {task.unresolved ? <AlertTriangle className="h-3.5 w-3.5 text-[#b42318]" aria-hidden /> : null}
      </span>
      <span className="truncate text-xs text-[#5a6b7d]">{formatActivity(task.last_activity_at)}</span>
    </button>
  );
}

export const TaskRow = memo(TaskRowInner);

export function TaskQueueHeader() {
  return (
    <div
      style={{ height: TASK_ROW_HEIGHT }}
      className={`sticky top-0 z-10 grid grid-cols-[minmax(0,1.4fr)_72px_88px_72px_88px_1fr] gap-2 border-b ${WMS_INV.borderStrong} ${WMS_INV.header} px-3 text-xs font-black uppercase tracking-wider`}
    >
      <span>Lokalizacja</span>
      <span>Postęp</span>
      <span>Operator</span>
      <span>Status</span>
      <span>Flagi</span>
      <span>Ostatnia aktywność</span>
    </div>
  );
}
