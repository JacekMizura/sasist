import type { WmsOperationalTaskApi } from "../../api/wmsOperationalTasksApi";

type Props = {
  tasks: WmsOperationalTaskApi[];
  groupBy?: "queue" | "priority";
};

export function TaskOrchestrationBoard({ tasks, groupBy = "queue" }: Props) {
  const groups = new Map<string, WmsOperationalTaskApi[]>();
  for (const t of tasks) {
    const key = groupBy === "priority" ? `P${t.priority}` : t.queue || t.task_type;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[...groups.entries()].map(([key, items]) => (
        <div key={key} className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
            {key} ({items.length})
          </div>
          <ul className="max-h-72 divide-y divide-slate-50 overflow-auto">
            {items.map((t) => (
              <li key={t.id} className="px-3 py-2 text-sm">
                <div className="font-medium text-slate-900">{t.summary_line || t.task_type}</div>
                <div className="text-xs text-slate-500">
                  {t.status} · #{t.id}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {groups.size === 0 ? (
        <p className="text-sm text-slate-400">Brak zadań w orchestracji.</p>
      ) : null}
    </div>
  );
}
