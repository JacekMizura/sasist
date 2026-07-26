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
  active: "border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-100",
  pending: "border-slate-300 bg-white text-slate-300",
  skipped: "border-slate-200 bg-slate-50 text-slate-300",
} as const;

const LABEL_CLASS = {
  done: "text-slate-900",
  active: "font-semibold text-orange-900",
  pending: "text-slate-400",
  skipped: "text-slate-400 line-through",
} as const;

export function ProductionExecutionTimeline({ source, className = "" }: Props) {
  const steps = buildProductionTimeline(source);

  return (
    <ol className={`relative space-y-2 border-l border-slate-200 pl-6 ${className}`}>
      {steps.map((step) => {
        const Icon = STATUS_ICON[step.status];
        return (
          <li key={step.key} className="relative py-0.5">
            <span
              className={`absolute -left-[1.9rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border ${STATUS_CLASS[step.status]}`}
              aria-hidden
            >
              <Icon className="h-3 w-3" strokeWidth={step.status === "done" ? 3 : 2} />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className={`text-sm ${LABEL_CLASS[step.status]}`}>{step.label}</p>
              {step.at ? (
                <p className="text-xs text-slate-500">{formatTimelineTimestamp(step.at)}</p>
              ) : step.status === "pending" ? (
                <p className="text-xs text-slate-400">Oczekuje</p>
              ) : step.status === "active" ? (
                <p className="text-xs font-medium text-orange-600">W trakcie</p>
              ) : null}
            </div>
            {step.detail ? <p className="text-xs text-slate-600">{step.detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
