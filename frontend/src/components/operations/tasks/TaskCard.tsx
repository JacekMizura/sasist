import type { WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";
import { formatOperationalDurationSince } from "../../../utils/formatOperationalDuration";
import {
  taskTypeLabel,
  zoneDisplayName,
} from "../../../services/operations/operationsTerminology";
type Props = {
  task: WmsOperationalTaskApi;
  onAssign?: () => void;
};

export function TaskCard({ task, onAssign }: Props) {
  const title =
    task.product_name ||
    task.summary_line ||
    (task.order_id ? `Zamówienie #${task.order_id}` : `Zadanie #${task.id}`);
  const age = formatOperationalDurationSince(task.created_at ?? undefined);
  const zone = zoneDisplayName(task.location_hint ?? task.task_payload?.zone_type);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="truncate text-xs font-semibold text-slate-900">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-600">
        <span className="rounded bg-slate-100 px-1.5 py-0.5">{taskTypeLabel(task.task_type)}</span>
        {task.priority > 0 ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">P{task.priority}</span>
        ) : null}
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-800">{zone}</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{age || "—"}</span>
        {task.assigned_user_id ? (
          <span>Operator #{task.assigned_user_id}</span>
        ) : (
          <span className="text-amber-700">Nieprzypisane</span>
        )}
      </div>
      {onAssign ? (
        <button
          type="button"
          onClick={onAssign}
          className="mt-1.5 text-[10px] font-medium text-sky-700 hover:underline"
        >
          Przypisz
        </button>
      ) : null}
    </div>
  );
}
