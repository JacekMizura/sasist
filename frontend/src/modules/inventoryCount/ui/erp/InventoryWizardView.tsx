import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  step: number;
  stepLabels: readonly string[];
  error?: string | null;
  busy?: boolean;
  cancelPath: string;
  onBack: () => void;
  onNext: () => void;
  isLastStep: boolean;
  /** Step 0 — type selection */
  inventoryType: string;
  onTypeChange: (type: string) => void;
  typeOptions: ReadonlyArray<{ id: string; label: string; hint: string }>;
  title: string;
  onTitleChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  /** Steps 1–3 body */
  stepContent?: React.ReactNode;
};

const WIZARD_STEPS = ["TYP", "ZAKRES", "USTAWIENIA", "PODSUMOWANIE"] as const;

function TypeOption({
  selected,
  title,
  hint,
  onSelect,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
        selected ? "border-slate-900 bg-slate-50/50" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <h3 className="mb-1 font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500">{hint}</p>
    </div>
  );
}

/** Wizard — pixel match uploaded mockup (all steps share same shell). */
export default function InventoryWizardView({
  step,
  stepLabels,
  error,
  busy,
  cancelPath,
  onBack,
  onNext,
  isLastStep,
  inventoryType,
  onTypeChange,
  typeOptions,
  title,
  onTitleChange,
  notes,
  onNotesChange,
  stepContent,
}: Props) {
  return (
    <div className="animate-in fade-in mx-auto max-w-3xl space-y-8 duration-300">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">Kreator inwentaryzacji</h2>
        <p className="mt-1 text-sm text-slate-500">
          Krok {step + 1} z {stepLabels.length}: {stepLabels[step]}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex border-b border-slate-100">
          {WIZARD_STEPS.map((label, idx) => (
            <div
              key={label}
              className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider ${
                idx === step
                  ? "-mb-[1px] border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-400"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

        {step === 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {typeOptions.map((t) => (
                <TypeOption
                  key={t.id}
                  selected={inventoryType === t.id}
                  title={t.label}
                  hint={t.hint}
                  onSelect={() => onTypeChange(t.id)}
                />
              ))}
            </div>

            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tytuł inwentaryzacji
                </label>
                <input
                  type="text"
                  placeholder="np. Roczna inwentaryzacja 2026"
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Opis / Notatka
                </label>
                <textarea
                  placeholder="Opcjonalny opis dla zespołu magazynowego"
                  rows={3}
                  className="w-full resize-none rounded-md border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">{stepContent}</div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={onBack}
            className="px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40"
          >
            Wstecz
          </button>
          <div className="space-x-3">
            <Link
              to={cancelPath}
              className="px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              Anuluj
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={onNext}
              className="flex items-center rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {isLastStep ? "Uruchom inwentaryzację" : "Dalej"}
              {!isLastStep ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
