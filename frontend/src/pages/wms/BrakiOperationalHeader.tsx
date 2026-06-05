import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
import { WMS_UI } from "./wmsTerminology";
import { priorityBadgeClass, priorityLabelForTask, priorityLevelFromTask } from "./brakiPriority";
import { brakiMixedStateSummary } from "./brakiWorkflowCta";
import { readBrakiOperationalState } from "./readBrakiOperationalState";

type Props = {
  task: OrderIssueTaskListItemApi;
};

function WorkstreamPill({
  label,
  count,
  tone,
}: {
  label: string;
  count?: number;
  tone: "amber" | "indigo" | "emerald" | "blue" | "red";
}) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-900 border-amber-200",
    indigo: "bg-indigo-100 text-indigo-900 border-indigo-200",
    emerald: "bg-emerald-100 text-emerald-900 border-emerald-200",
    blue: "bg-blue-100 text-blue-900 border-blue-200",
    red: "bg-red-100 text-red-900 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}
    >
      {label}
      {count != null && count > 0 ? <span className="font-black">({count})</span> : null}
    </span>
  );
}

/** Górny pasek kontekstu operacyjnego Braki — mieszane stany zamówienia. */
export function BrakiOperationalHeader({ task }: Props) {
  const op = readBrakiOperationalState(task);
  const ws = op.workstreams;
  const workflowLabel = op.workflow_stage || (task.braki_workflow_status_label ?? "").trim() || brakiMixedStateSummary(task);
  const summary = brakiMixedStateSummary(task);
  const prLevel = priorityLevelFromTask(task);
  const prLabel = priorityLabelForTask(task);

  return (
    <div className="border-b border-slate-200 bg-slate-900 text-white">
      <div className="px-4 py-3 md:px-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Braki WMS — kontekst operacyjny
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-mono text-xl font-black tracking-tight md:text-2xl">
            {task.order_number}
          </h2>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-200">
            {workflowLabel}
          </span>
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${priorityBadgeClass(prLevel)}`}
          >
            {prLabel}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate-300">
          Aktywne operacje: <span className="font-semibold text-white">{summary}</span>
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ws.has_oms_pending ? (
            <WorkstreamPill label="Decyzja OMS" count={ws.oms_line_count} tone="red" />
          ) : null}
          {ws.has_pick_work ? (
            <WorkstreamPill label="Do zebrania" count={ws.pick_line_count} tone="amber" />
          ) : null}
          {ws.has_relocation_work ? (
            <WorkstreamPill
              label={WMS_UI.productRelocation}
              count={ws.relocation_line_count}
              tone="indigo"
            />
          ) : null}
          {ws.has_packing_ready ? (
            <WorkstreamPill label="Gotowe do pakowania" count={ws.packing_ready_line_count} tone="blue" />
          ) : null}
          {ws.collected_line_count > 0 ? (
            <WorkstreamPill label="Zebrane" count={ws.collected_line_count} tone="emerald" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
