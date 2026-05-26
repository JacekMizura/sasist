import { Activity, Clock, User } from "lucide-react";
import type { WmsOperationalTaskApi, WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import { formatRelativeAge, progressPct } from "./operationalWorkflow";
import { lastEventSummary } from "./operationalWorkflow";

type Props = {
  task: WmsOperationalTaskApi;
  detail?: WmsOperationalTaskDetailApi | null;
};

export function OperationalLiveStatusStrip({ task, detail }: Props) {
  const pct = progressPct(task);
  const lastEv = detail ? lastEventSummary(detail) : null;
  const sess = detail?.relocation_session;
  const age = formatRelativeAge(task.updated_at ?? task.created_at);

  return (
    <div className="space-y-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            task.status === "done" ? "bg-emerald-500" : "bg-indigo-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5">
          <Clock size={11} />
          {age}
        </span>
        {sess?.operator_name ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-indigo-900">
            <User size={11} />
            {sess.operator_name}
          </span>
        ) : null}
        {sess?.active_carrier_label ? (
          <span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-900">
            → {sess.active_carrier_label}
          </span>
        ) : null}
        {lastEv ? (
          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-900">
            <Activity size={11} className="shrink-0" />
            <span className="truncate normal-case">{lastEv}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
