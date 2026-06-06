import { TaskBoard } from "../../../components/operations/tasks/TaskBoard";
import { useRuntimeTasks } from "../../../hooks/tasks/useRuntimeTasks";

export default function OperationsTasksPage() {
  const { byColumn, groupBy, setGroupBy, loading } = useRuntimeTasks();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <h1 className="text-base font-semibold text-slate-900">Tablica zadań operacyjnych</h1>
      <TaskBoard byColumn={byColumn} groupBy={groupBy} onGroupByChange={setGroupBy} loading={loading} />
    </div>
  );
}
