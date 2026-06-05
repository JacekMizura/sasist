import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
import { WMS_UI } from "./wmsTerminology";
import { priorityBadgeClass, priorityLabelForTask, priorityLevelFromTask } from "./brakiPriority";
import { brakiMixedStateSummary } from "./brakiWorkflowCta";
import { readBrakiOperationalState } from "./readBrakiOperationalState";
import { BrakiWorkstreamPill } from "./brakiWorkstreamUi";

type Props = {
  task: OrderIssueTaskListItemApi;
};

/** Kompaktowy nagłówek zamówienia na karcie braków — ten sam język wizualny co reszta WMS. */
export function BrakiOperationalHeader({ task }: Props) {
  const op = readBrakiOperationalState(task);
  const ws = op.workstreams;
  const workflowLabel =
    op.workflow_stage || (task.braki_workflow_status_label ?? "").trim() || brakiMixedStateSummary(task);
  const summary = brakiMixedStateSummary(task);
  const prLevel = priorityLevelFromTask(task);
  const prLabel = priorityLabelForTask(task);
  const customer =
    (task.customer_name ?? "").trim() || (task.delivery_name ?? "").trim() || "—";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Braki WMS</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-mono text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
              {task.order_number}
            </h2>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {workflowLabel}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityBadgeClass(prLevel)}`}
            >
              {prLabel}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">
            <span className="font-medium text-slate-500">Klient:</span>{" "}
            <span className="font-semibold text-slate-800">{customer}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-medium text-slate-500">Aktywne operacje:</span>{" "}
            <span className="font-semibold text-slate-800">{summary}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        {ws.has_oms_pending ? (
          <BrakiWorkstreamPill label="Decyzja OMS" count={ws.oms_line_count} tone="red" />
        ) : null}
        {ws.has_pick_work ? (
          <BrakiWorkstreamPill label="Do zebrania" count={ws.pick_line_count} tone="amber" />
        ) : null}
        {ws.has_relocation_work ? (
          <BrakiWorkstreamPill
            label={WMS_UI.productRelocation}
            count={ws.relocation_line_count}
            tone="indigo"
          />
        ) : null}
        {ws.has_packing_ready ? (
          <BrakiWorkstreamPill label="Gotowe do pakowania" count={ws.packing_ready_line_count} tone="blue" />
        ) : null}
        {ws.collected_line_count > 0 ? (
          <BrakiWorkstreamPill label="Zebrane" count={ws.collected_line_count} tone="emerald" />
        ) : null}
      </div>
    </div>
  );
}
