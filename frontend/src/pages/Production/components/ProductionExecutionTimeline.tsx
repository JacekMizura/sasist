import { Check, Circle, CircleDot, Minus } from "lucide-react";

import {
  buildProductionTimeline,
  formatTimelineTimestamp,
  type TimelineSource,
} from "@/modules/production/productionExecutionTimeline";

type Props = {
  source: TimelineSource;
  className?: string;
};

const STATUS_ICON = {
  done: Check,
  active: CircleDot,
  pending: Circle,
  skipped: Minus,
} as const;

const STATUS_CLASS = {
  done: "border-emerald-500 bg-emerald-500 text-white",
  active: "border-violet-500 bg-violet-50 text-violet-700 ring-4 ring-violet-100",
  pending: "border-slate-300 bg-white text-slate-300",
  skipped: "border-slate-200 bg-slate-50 text-slate-300",
} as const;

const LABEL_CLASS = {
  done: "text-slate-900",
  active: "text-violet-900 font-semibold",
  pending: "text-slate-400",
  skipped: "text-slate-400 line-through",
} as const;

export function ProductionExecutionTimeline({ source, className = "" }: Props) {
  const steps = buildProductionTimeline(source);

  return (
    <ol className={`relative border-l-2 border-slate-200 pl-8 space-y-6 ${className}`}>
      {steps.map((step) => {
        const Icon = STATUS_ICON[step.status];
        return (
          <li key={step.key} className="relative">
            <span
              className={`absolute -left-[2.15rem] top-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 ${STATUS_CLASS[step.status]}`}
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={step.status === "done" ? 3 : 2} />
            </span>
            <p className={`text-sm ${LABEL_CLASS[step.status]}`}>{step.label}</p>
            {step.detail ? <p className="mt-0.5 text-xs font-medium text-slate-600">{step.detail}</p> : null}
            {step.at ? (
              <p className="mt-0.5 text-xs text-slate-500">{formatTimelineTimestamp(step.at)}</p>
            ) : step.status === "pending" ? (
              <p className="mt-0.5 text-xs text-slate-400">Oczekuje</p>
            ) : step.status === "active" ? (
              <p className="mt-0.5 text-xs font-medium text-violet-600">W trakcie</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
