import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import {
  erpBtnGhost,
  erpBtnPrimary,
  erpFieldInput,
  erpFieldLabel,
  erpPageShell,
  erpSelectCard,
  erpSelectCardHint,
  erpSelectCardTitle,
  erpSurfaceCard,
  erpWizardFooter,
  erpWizardStepItem,
  erpWizardStepNav,
} from "./theme";

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
    <div role="button" tabIndex={0} onClick={onSelect} onKeyDown={(e) => e.key === "Enter" && onSelect()} className={erpSelectCard(selected)}>
      <h4 className={erpSelectCardTitle(selected)}>{title}</h4>
      <p className={erpSelectCardHint(selected)}>{hint}</p>
    </div>
  );
}

/** Wizard shell — mockup-aligned steps, cards, footer (presentation only). */
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
    <div className={`${erpPageShell} flex flex-col`}>
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Kreator inwentaryzacji</h2>
        <p className="mt-1 text-sm text-slate-500">
          Krok {step + 1} z {stepLabels.length}: {stepLabels[step]}
        </p>
      </div>

      <div className={erpWizardStepNav}>
        {WIZARD_STEPS.map((label, idx) => (
          <div key={label} className={erpWizardStepItem(idx === step)}>
            {label}
          </div>
        ))}
      </div>

      <div className="max-w-4xl flex-1">
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
              <label className="block">
                <span className={erpFieldLabel}>Tytuł inwentaryzacji</span>
                <input
                  type="text"
                  placeholder="np. Roczna inwentaryzacja 2026"
                  className={erpFieldInput}
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={erpFieldLabel}>Opis / Notatka</span>
                <input
                  type="text"
                  placeholder="Opcjonalny opis dla zespołu magazynowego"
                  className={erpFieldInput}
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                />
              </label>
            </div>
          </div>
        ) : step === 1 ? (
          <div className={`${erpSurfaceCard} space-y-4 p-6`}>{stepContent}</div>
        ) : (
          <div className="space-y-6">{stepContent}</div>
        )}
      </div>

      <div className={erpWizardFooter}>
        <button type="button" disabled={step === 0 || busy} onClick={onBack} className={erpBtnGhost}>
          Wstecz
        </button>
        <div className="flex items-center gap-2">
          <Link to={cancelPath} className={erpBtnGhost}>
            Anuluj
          </Link>
          <button type="button" disabled={busy} onClick={onNext} className={erpBtnPrimary}>
            {isLastStep ? "Uruchom inwentaryzację" : "Dalej"}
            {!isLastStep ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
