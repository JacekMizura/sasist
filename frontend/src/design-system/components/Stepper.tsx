import type { HTMLAttributes, ReactNode } from "react";
import { colors, typography } from "../tokens";

export type StepperStep = {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
};

export type StepperProps = HTMLAttributes<HTMLElement> & {
  steps: StepperStep[];
  /** 0-based active step index. */
  activeIndex: number;
};

/**
 * Horizontal process indicator for single-page wizards (create flows).
 * Visual only — does not navigate between routes.
 */
export function Stepper({ steps, activeIndex, className = "", ...props }: StepperProps) {
  return (
    <nav
      aria-label="Kroki"
      className={`min-w-0${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      <ol className="flex flex-wrap items-start gap-2 sm:gap-0">
        {steps.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          const tone = active
            ? "border-orange-500 bg-orange-50 text-orange-800"
            : done
              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-500";
          return (
            <li key={step.id ?? index} className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${tone}`}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      active ? colors.text.primary : done ? "text-emerald-800" : colors.text.muted
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {step.description ? (
                  <p className={`pl-9 ${typography.caption}`}>{step.description}</p>
                ) : null}
              </div>
              {index < steps.length - 1 ? (
                <div
                  className={`mt-3.5 hidden h-px flex-1 sm:block ${done || active ? "bg-orange-300" : "bg-slate-200"}`}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
