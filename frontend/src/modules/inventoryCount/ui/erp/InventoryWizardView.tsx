import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { moduleListPageShellClass } from "@/components/listPage/moduleListLayoutTokens";
import { filterInputClass } from "@/components/filters";
import { erpSurfaceCard } from "./theme";

type Props = {
  step: number;
  stepLabels: readonly string[];
  error?: string | null;
  busy?: boolean;
  cancelPath: string;
  onBack: () => void;
  onNext: () => void;
  isLastStep: boolean;
  inventoryType: string;
  onTypeChange: (type: string) => void;
  typeOptions: ReadonlyArray<{ id: string; label: string; hint: string }>;
  title: string;
  onTitleChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  stepContent?: React.ReactNode;
};

const WIZARD_STEPS = ["Typ", "Zakres", "Ustawienia", "Podsumowanie"] as const;

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
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
        selected ? "border-slate-900 bg-slate-50/50" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </button>
  );
}

/** Wizard — standard ERP card body (shell in {@link InventoryLayout}). */
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
    <div className={moduleListPageShellClass}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900">Kreator inwentaryzacji</h2>
        <p className="mt-1 text-sm text-slate-500">
          Krok {step + 1} z {stepLabels.length}: {stepLabels[step]}
        </p>
      </div>

      <div className={`${erpSurfaceCard} p-5`}>
        <div className="mb-6 flex border-b border-slate-200">
          {WIZARD_STEPS.map((label, idx) => (
            <div
              key={label}
              className={`flex-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${
                idx === step ? "-mb-px border-b-2 border-orange-500 text-slate-900" : "text-slate-400"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

        {step === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tytuł inwentaryzacji
                <input
                  type="text"
                  placeholder="np. Roczna inwentaryzacja 2026"
                  className={`${filterInputClass} mt-1`}
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Opis / notatka
                <textarea
                  placeholder="Opcjonalny opis dla zespołu magazynowego"
                  rows={3}
                  className={`${filterInputClass} mt-1 resize-none`}
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">{stepContent}</div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={onBack}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Wstecz
          </button>
          <div className="flex gap-2">
            <Link
              to={cancelPath}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Anuluj
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={onNext}
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
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
