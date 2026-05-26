import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import { buildWorkflowTimeline, type WorkflowStepState } from "./operationalWorkflow";

function stepDotClass(state: WorkflowStepState): string {
  if (state === "done") return "bg-emerald-500 ring-emerald-200";
  if (state === "current") return "bg-indigo-600 ring-indigo-200 animate-pulse";
  if (state === "skipped") return "bg-slate-300 ring-slate-100";
  return "bg-slate-200 ring-slate-100";
}

type Props = {
  detail: WmsOperationalTaskDetailApi;
  compact?: boolean;
};

export function OperationalWorkflowTimeline({ detail, compact }: Props) {
  const steps = buildWorkflowTimeline(detail);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Przepływ operacyjny</p>
      <ol className={`mt-3 space-y-0 ${compact ? "" : "sm:pl-1"}`}>
        {steps.map((step, idx) => (
          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
            {idx < steps.length - 1 ? (
              <span
                className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-0.5 bg-slate-200"
                aria-hidden
              />
            ) : null}
            <span
              className={`relative z-[1] mt-0.5 h-4 w-4 shrink-0 rounded-full ring-4 ${stepDotClass(step.state)}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-bold ${
                  step.state === "current" ? "text-indigo-950" : "text-slate-800"
                }`}
              >
                {step.label}
              </p>
              {step.hint ? <p className="mt-0.5 text-xs text-slate-600">{step.hint}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
