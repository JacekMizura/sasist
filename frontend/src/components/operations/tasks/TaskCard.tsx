import type { WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";

type Props = {
  task: WmsOperationalTaskApi;
  onAssign?: () => void;
};

export function TaskCard({ task, onAssign }: Props) {
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
      <div className="truncate text-xs font-medium text-slate-900">
        {task.product_name || task.summary_line || `#${task.id}`}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
        <span>{task.task_type}</span>
        <span>P{task.priority}</span>
        {task.assigned_user_id ? <span>op.{task.assigned_user_id}</span> : null}
      </div>
      {onAssign ? (
        <button type="button" onClick={onAssign} className="mt-1 text-[10px] text-sky-700 hover:underline">
          Przypisz
        </button>
      ) : null}
    </div>
  );
}
