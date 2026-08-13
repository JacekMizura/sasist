import type { ReactNode } from "react";

import type { StatusTone } from "@/design-system";

const TONE_BANNER: Record<StatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  primary: "border-orange-200 bg-orange-50 text-orange-950",
  neutral: "border-slate-200 bg-slate-50 text-slate-900",
};

type Props = {
  message: string;
  tone?: StatusTone;
  action?: ReactNode;
  className?: string;
};

/** Large contextual “co dalej?” banner for order/batch detail headers. */
export function ProductionContextBanner({
  message,
  tone = "neutral",
  action,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${TONE_BANNER[tone]} ${className}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Co dalej?</p>
        <p className="mt-0.5 text-base font-semibold leading-snug sm:text-lg">{message}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
