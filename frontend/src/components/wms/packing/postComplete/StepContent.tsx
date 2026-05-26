import type { ReactNode } from "react";
import { CheckCheck, ClipboardList, Loader2, PackageOpen, Printer } from "lucide-react";

const STEP_TITLES = [
  "Wystawiam dokument sprzedaży",
  "Generuję i drukuję list przewozowy",
  "Zmieniam status zamówienia",
] as const;

const FINAL_SCAN =
  "Zeskanuj kolejny produkt, aby przejść do kolejnego zamówienia";

function StepIcon0() {
  return (
    <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center text-slate-800" aria-hidden>
      <ClipboardList className="h-16 w-16 stroke-[1.25]" />
    </div>
  );
}

function StepIcon1() {
  return (
    <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center text-slate-800" aria-hidden>
      <div className="relative">
        <PackageOpen className="h-14 w-14 stroke-[1.2]" />
        <Printer className="absolute -bottom-1 -right-1 h-7 w-7 stroke-[1.4] text-slate-700" />
      </div>
    </div>
  );
}

function StepIcon2() {
  return (
    <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center text-slate-800" aria-hidden>
      <CheckCheck className="h-16 w-16 stroke-[1.2]" />
    </div>
  );
}

function StepIcon3() {
  return (
    <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center text-slate-900" aria-hidden>
      <CheckCheck className="h-16 w-16 stroke-[1.35]" />
      <span className="pointer-events-none absolute -top-1 left-1/2 flex -translate-x-1/2 gap-0.5">
        <span className="h-1 w-1 rounded-full bg-amber-400" />
        <span className="h-1 w-1 rounded-full bg-amber-400" />
        <span className="h-1 w-1 rounded-full bg-amber-400" />
      </span>
    </div>
  );
}

function ChecklistLine({
  done,
  active,
  children,
}: {
  done: boolean;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-left">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-slate-400" aria-hidden>
        {done ? (
          <span className="text-base leading-none">✓</span>
        ) : active ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
        ) : (
          <span className="h-4 w-4 rounded-full border border-slate-300" />
        )}
      </span>
      <span
        className={[
          "min-w-0 text-[15px] leading-snug",
          done ? "font-normal text-slate-400" : "",
          active ? "font-bold text-slate-900" : "",
          !done && !active ? "text-slate-500" : "",
        ].join(" ")}
      >
        {children}
      </span>
    </div>
  );
}

export type StepContentProps = {
  stepIndex: number;
};

export function StepContent({ stepIndex }: StepContentProps) {
  if (stepIndex === 3) {
    return (
      <div className="flex w-full gap-4">
        <StepIcon3 />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2.5">
            <ChecklistLine done active={false}>
              {STEP_TITLES[0]}
            </ChecklistLine>
            <ChecklistLine done active={false}>
              {STEP_TITLES[1]}
            </ChecklistLine>
            <ChecklistLine done active={false}>
              {STEP_TITLES[2]}
            </ChecklistLine>
          </div>
          <div className="my-5 border-t border-slate-200" />
          <p className="text-center text-lg font-bold leading-snug text-slate-900 sm:text-xl">{FINAL_SCAN}</p>
        </div>
      </div>
    );
  }

  if (stepIndex === 0) {
    return (
      <div className="flex w-full gap-4">
        <StepIcon0 />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-500" aria-hidden />
          <p className="text-[17px] font-bold leading-snug text-slate-900">{STEP_TITLES[0]}</p>
        </div>
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="flex w-full gap-4">
        <StepIcon1 />
        <div className="min-w-0 flex-1 space-y-3">
          <ChecklistLine done active={false}>{STEP_TITLES[0]}</ChecklistLine>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            </span>
            <p className="min-w-0 text-[15px] font-bold leading-snug text-slate-900">{STEP_TITLES[1]}</p>
          </div>
        </div>
      </div>
    );
  }

  /* stepIndex === 2 */
  return (
    <div className="flex w-full gap-4">
      <StepIcon2 />
      <div className="min-w-0 flex-1 space-y-3">
        <ChecklistLine done active={false}>{STEP_TITLES[0]}</ChecklistLine>
        <ChecklistLine done active={false}>{STEP_TITLES[1]}</ChecklistLine>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
            <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
          </span>
          <p className="min-w-0 text-[15px] font-bold leading-snug text-slate-900">{STEP_TITLES[2]}</p>
        </div>
      </div>
    </div>
  );
}
