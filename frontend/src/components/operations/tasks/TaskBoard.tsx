import type { TaskGroupBy } from "../../../hooks/tasks/useRuntimeTasks";
import { BOARD_COLUMNS } from "../../../hooks/tasks/useRuntimeTasks";
import type { WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";
import { TaskColumn } from "./TaskColumn";

type Props = {
  byColumn: Map<string, WmsOperationalTaskApi[]>;
  groupBy: TaskGroupBy;
  onGroupByChange: (g: TaskGroupBy) => void;
  loading?: boolean;
};

const GROUP_OPTIONS: { id: TaskGroupBy; label: string }[] = [
  { id: "task_type", label: "Typ" },
  { id: "zone", label: "Strefa" },
  { id: "operator", label: "Operator" },
  { id: "priority", label: "Priorytet" },
  { id: "sla", label: "SLA" },
];

export function TaskBoard({ byColumn, groupBy, onGroupByChange, loading }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Grupowanie:</span>
        {GROUP_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onGroupByChange(o.id)}
            className={`rounded px-2 py-0.5 text-xs ${
              groupBy === o.id ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600"
            }`}
          >
            {o.label}
          </button>
        ))}
        {loading ? <span className="text-xs text-slate-400">Odświeżanie…</span> : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
        {BOARD_COLUMNS.map((col) => (
          <TaskColumn key={col} title={col} tasks={byColumn.get(col) ?? []} />
        ))}
      </div>
    </div>
  );
}
