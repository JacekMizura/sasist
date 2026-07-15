export type PrintQueueWizardStepId = 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{ id: PrintQueueWizardStepId; label: string }> = [
  { id: 1, label: "Szablon" },
  { id: 2, label: "Dane" },
  { id: 3, label: "Filtry" },
  { id: 4, label: "Podgląd" },
  { id: 5, label: "Generowanie" },
];

type Props = {
  currentStep: PrintQueueWizardStepId;
  onStepClick?: (step: PrintQueueWizardStepId) => void;
};

/** Circular wizard steps — blue active, slate inactive (Vercel/Linear style). */
export default function PrintQueueStepWizard({ currentStep, onStepClick }: Props) {
  return (
    <nav aria-label="Kroki kolejki druku" className="w-full">
      <ol className="flex flex-wrap items-center justify-between gap-y-3">
        {STEPS.map((step, index) => {
          const active = step.id === currentStep;
          const done = step.id < currentStep;
          const clickable = Boolean(onStepClick);
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStepClick?.(step.id)}
                className={[
                  "flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-left transition",
                  clickable ? "hover:bg-white" : "cursor-default",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : done
                        ? "bg-blue-100 text-blue-700"
                        : "border border-gray-200 bg-white text-slate-400",
                  ].join(" ")}
                >
                  {step.id}
                </span>
                <span
                  className={[
                    "truncate text-sm font-semibold",
                    active ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <div
                  className={[
                    "mx-2 hidden h-px min-w-[12px] flex-1 sm:block",
                    done || active ? "bg-blue-200" : "bg-gray-200",
                  ].join(" ")}
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
