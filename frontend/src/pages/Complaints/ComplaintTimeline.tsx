import { Fragment } from "react";
import { Check } from "lucide-react";

import {
  COMPLAINT_STATUS_LABELS_PL,
  normalizeComplaintStatus,
  type ComplaintStatusCode,
} from "../../types/complaint";

/** Kolejność etapów w osi (API). */
const TIMELINE_ORDER: readonly ComplaintStatusCode[] = [
  "NOWE",
  "OCZEKIWANIE_NA_PRODUKT",
  "WERYFIKACJA",
  "DECYZJA",
  "ZAAKCEPTOWANA",
  "ODRZUCONA",
] as const;

export const COMPLAINT_TIMELINE_STEPS = TIMELINE_ORDER;

const STEP_ACCENT: Record<
  ComplaintStatusCode,
  { fill: string; ring: string; label: string; line: string }
> = {
  NOWE: {
    fill: "bg-emerald-400",
    ring: "ring-emerald-300",
    label: "text-emerald-800",
    line: "bg-emerald-400",
  },
  OCZEKIWANIE_NA_PRODUKT: {
    fill: "bg-amber-500",
    ring: "ring-amber-400",
    label: "text-amber-950",
    line: "bg-amber-500",
  },
  WERYFIKACJA: {
    fill: "bg-blue-500",
    ring: "ring-blue-400",
    label: "text-blue-900",
    line: "bg-blue-500",
  },
  DECYZJA: {
    fill: "bg-orange-500",
    ring: "ring-orange-400",
    label: "text-orange-950",
    line: "bg-orange-500",
  },
  ZAAKCEPTOWANA: {
    fill: "bg-emerald-600",
    ring: "ring-emerald-500",
    label: "text-emerald-900",
    line: "bg-emerald-600",
  },
  ODRZUCONA: {
    fill: "bg-red-500",
    ring: "ring-red-400",
    label: "text-red-950",
    line: "bg-red-500",
  },
};

type Phase = "past" | "current" | "future" | "skipped";

function statusIndex(c: ComplaintStatusCode): number {
  const i = TIMELINE_ORDER.indexOf(c);
  return i >= 0 ? i : 0;
}

function stepPhase(stepIndex: number, stepCode: ComplaintStatusCode, cur: ComplaintStatusCode): Phase {
  if (cur === "ZAAKCEPTOWANA") {
    if (stepIndex <= 3) return "past";
    if (stepCode === "ZAAKCEPTOWANA") return "current";
    return "skipped";
  }
  if (cur === "ODRZUCONA") {
    if (stepIndex <= 3) return "past";
    if (stepCode === "ZAAKCEPTOWANA") return "skipped";
    return "current";
  }
  const ci = statusIndex(cur);
  if (stepIndex < ci) return "past";
  if (stepIndex === ci) return "current";
  return "future";
}

function connectorComplete(beforeIndex: number, cur: ComplaintStatusCode): boolean {
  return statusIndex(cur) > beforeIndex;
}

function lineClass(beforeIndex: number, cur: ComplaintStatusCode): string {
  const done = connectorComplete(beforeIndex, cur);
  const activeConnector = statusIndex(cur) === beforeIndex + 1;
  if (!done) return activeConnector ? "bg-blue-300" : "bg-gray-200";
  const prevCode = COMPLAINT_TIMELINE_STEPS[beforeIndex]!;
  return STEP_ACCENT[prevCode].line;
}

export type ComplaintTimelineProps = {
  status: string | null | undefined;
  disabled?: boolean;
  /** Gdy true, nie można kliknąć etapów końcowych (zaakceptowana / odrzucona). */
  terminalClickDisabled?: boolean;
  onChange: (next: ComplaintStatusCode) => void;
};

export default function ComplaintTimeline({ status, disabled, terminalClickDisabled, onChange }: ComplaintTimelineProps) {
  const cur = normalizeComplaintStatus(status);

  return (
    <div
      className="w-full max-w-full overflow-x-auto overflow-y-visible px-4 pb-1 [-webkit-overflow-scrolling:touch]"
      role="group"
      aria-label="Przebieg reklamacji"
    >
      <div className="flex w-max min-w-full max-w-none items-start justify-start gap-3 py-2 pl-0 pr-8 sm:gap-4">
        {COMPLAINT_TIMELINE_STEPS.map((code, i) => {
          const phase = stepPhase(i, code, cur);
          const accent = STEP_ACCENT[code];
          const isPast = phase === "past";
          const isCurrent = phase === "current";
          const isSkipped = phase === "skipped";

          const circleBase =
            "mx-auto flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

          let circleClass = `${circleBase} h-8 w-8 sm:h-9 sm:w-9`;
          if (isCurrent) {
            circleClass += ` scale-[1.2] border-transparent ${accent.fill} text-white shadow-md ring-2 ${accent.ring} ring-offset-2 ring-offset-white`;
          } else if (isPast) {
            circleClass += ` border-transparent ${accent.fill} text-white`;
          } else if (isSkipped) {
            circleClass += " border-dashed border-gray-300 bg-gray-50 text-gray-400";
          } else {
            circleClass += " border-gray-200 bg-white text-gray-300";
          }

          const labelClass = `w-full px-0.5 text-center text-[10px] font-medium leading-snug sm:text-xs ${
            isCurrent
              ? `${accent.label} font-bold`
              : isPast
                ? "text-gray-600"
                : isSkipped
                  ? "text-gray-400"
                  : "text-gray-400"
          }`;

          const terminalLocked =
            Boolean(terminalClickDisabled) && (code === "ZAAKCEPTOWANA" || code === "ODRZUCONA");
          return (
            <Fragment key={code}>
              <div className="flex min-w-[120px] max-w-[10rem] shrink-0 flex-col items-stretch gap-2">
                <button
                  type="button"
                  disabled={Boolean(disabled) || terminalLocked}
                  onClick={() => onChange(code)}
                  className={circleClass}
                  title={
                    terminalLocked
                      ? `${COMPLAINT_STATUS_LABELS_PL[code]} — ukończ operacje na wszystkich pozycjach`
                      : COMPLAINT_STATUS_LABELS_PL[code]
                  }
                >
                  {isPast ? <Check className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.5} aria-hidden /> : null}
                  {isCurrent ? <span className="h-2 w-2 rounded-full bg-white/95 shadow-sm" aria-hidden /> : null}
                </button>
                <span className={labelClass}>{COMPLAINT_STATUS_LABELS_PL[code]}</span>
              </div>
              {i < COMPLAINT_TIMELINE_STEPS.length - 1 ? (
                <span
                  className={`mt-[15px] min-h-1 min-w-[12px] max-w-[200px] flex-1 basis-0 rounded-full sm:mt-[17px] ${
                    statusIndex(cur) === i + 1 ? "h-1.5" : "h-1"
                  } ${lineClass(i, cur)}`}
                  aria-hidden
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
