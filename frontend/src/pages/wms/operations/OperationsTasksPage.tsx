import { TaskBoard } from "../../../components/operations/tasks/TaskBoard";
import { useRuntimeTasks } from "../../../hooks/tasks/useRuntimeTasks";

export default function OperationsTasksPage() {
  const { byColumn, groupBy, setGroupBy, loading, tasks } = useRuntimeTasks();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-2 md:p-3">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Zadania</h1>
        <p className="text-xs text-slate-500">
          {tasks.length > 0
            ? `${tasks.length} zadań operacyjnych w magazynie`
            : "Brak aktywnych zadań — magazyn pracuje płynnie"}
        </p>
      </header>
      <TaskBoard byColumn={byColumn} groupBy={groupBy} onGroupByChange={setGroupBy} loading={loading} />
    </div>
  );
}
