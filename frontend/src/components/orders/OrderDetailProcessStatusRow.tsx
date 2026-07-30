import type { ReactNode } from "react";
import { Truck } from "lucide-react";

type StepState = "active" | "done" | "idle";

function ProcessStep({ state }: { state: StepState }) {
  if (state === "done") {
    return <div className="h-5 w-5 rounded-full border-2 border-emerald-500 bg-emerald-500" aria-hidden />;
  }
  if (state === "active") {
    return <div className="h-5 w-5 rounded-full border-2 border-blue-500 bg-white" aria-hidden />;
  }
  return <div className="h-5 w-5 rounded-full border border-slate-300 bg-white" aria-hidden />;
}

type Props = {
  /** Primary panel status control (dropdown). */
  statusControl: ReactNode;
  /** Micro label above status (e.g. group „Nowe”). */
  statusGroupLabel?: string | null;
  /** Shipping / fulfillment pill title. */
  processTitle: string;
  processSubtitle?: string | null;
  /** Derived from existing WMS dual progress — presentation only. */
  pickDone: boolean;
  packDone: boolean;
  hasProgress: boolean;
};

/**
 * Mockup-aligned status row: primary status left, process pill + 3-step visual right.
 * Steps map existing pick/pack completion — no new workflow engine.
 */
export function OrderDetailProcessStatusRow({
  statusControl,
  statusGroupLabel,
  processTitle,
  processSubtitle,
  pickDone,
  packDone,
  hasProgress,
}: Props) {
  const step1: StepState = hasProgress ? (pickDone ? "done" : "active") : "active";
  const step2: StepState = pickDone ? (packDone ? "done" : "active") : "idle";
  const step3: StepState = packDone ? "done" : "idle";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {statusGroupLabel ? (
          <div className="mb-1 text-[11px] text-slate-500">{statusGroupLabel}</div>
        ) : null}
        {statusControl}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600">
            <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-tight text-slate-900">{processTitle}</span>
            {processSubtitle ? (
              <span className="text-[10px] text-slate-500">{processSubtitle}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5" aria-label="Postęp procesu">
          <ProcessStep state={step1} />
          <div className="h-px w-6 bg-slate-300" aria-hidden />
          <ProcessStep state={step2} />
          <div className="h-px w-6 bg-slate-300" aria-hidden />
          <ProcessStep state={step3} />
        </div>
      </div>
    </div>
  );
}
