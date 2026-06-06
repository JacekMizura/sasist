import type { ExecutionStep } from "../../../hooks/replenishment/useReplenishmentExecution";

const STEPS: { id: ExecutionStep; label: string; hint: string }[] = [
  { id: "scan_source", label: "Lokalizacja źródłowa", hint: "Zeskanuj skąd bierzesz towar" },
  { id: "scan_product", label: "Produkt", hint: "Zeskanuj EAN produktu" },
  { id: "scan_target", label: "Lokalizacja docelowa", hint: "Zeskanuj półkę docelową" },
  { id: "complete", label: "Potwierdzenie", hint: "Zatwierdź wykonanie" },
];

type Props = {
  step: ExecutionStep;
};

export function ReplenishmentExecutionSteps({ step }: Props) {
  const activeIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <ol className="grid grid-cols-4 gap-1">
      {STEPS.map((s, i) => {
        const done = i < activeIdx;
        const active = s.id === step;
        return (
          <li
            key={s.id}
            className={`rounded-lg border px-1.5 py-2 text-center ${
              active
                ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200"
                : done
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-[10px] font-bold tabular-nums text-slate-400">{i + 1}</div>
            <div className={`text-[10px] font-semibold ${active ? "text-sky-900" : "text-slate-700"}`}>
              {s.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function replenishmentStepHint(step: ExecutionStep): string {
  return STEPS.find((s) => s.id === step)?.hint ?? "Skanuj kod";
}
