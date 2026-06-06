import type { WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";
import { TaskCard } from "./TaskCard";

type Props = {
  title: string;
  tasks: WmsOperationalTaskApi[];
};

export function TaskColumn({ title, tasks }: Props) {
  return (
    <div className="flex min-w-[160px] flex-1 flex-col rounded border border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-200 px-2 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
        {title} <span className="text-slate-400">({tasks.length})</span>
      </div>
      <div className="flex max-h-[calc(100vh-220px)] flex-col gap-1 overflow-auto p-1.5">
        {tasks.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-slate-400">Brak zadań</p>
        ) : (
          tasks.map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}
