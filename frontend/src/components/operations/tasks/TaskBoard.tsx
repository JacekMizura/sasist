import type { TaskGroupBy } from "../../../hooks/tasks/useRuntimeTasks";
import { BOARD_COLUMNS } from "../../../hooks/tasks/useRuntimeTasks";
import type { WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";
import { TASK_COLUMN_LABELS, TASK_GROUP_LABELS } from "../../../services/operations/operationsTerminology";
import { TaskColumn } from "./TaskColumn";

type Props = {
  byColumn: Map<string, WmsOperationalTaskApi[]>;
  groupBy: TaskGroupBy;
  onGroupByChange: (g: TaskGroupBy) => void;
  loading?: boolean;
};

export function TaskBoard({ byColumn, groupBy, onGroupByChange, loading }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Grupowanie:</span>
        {(Object.keys(TASK_GROUP_LABELS) as TaskGroupBy[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onGroupByChange(id)}
            className={`rounded px-2 py-0.5 text-xs ${
              groupBy === id ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600"
            }`}
          >
            {TASK_GROUP_LABELS[id]}
          </button>
        ))}
        {loading ? <span className="text-xs text-slate-400">Odświeżanie…</span> : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
        {BOARD_COLUMNS.map((col) => (
          <TaskColumn
            key={col}
            title={TASK_COLUMN_LABELS[col] ?? col}
            tasks={byColumn.get(col) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
