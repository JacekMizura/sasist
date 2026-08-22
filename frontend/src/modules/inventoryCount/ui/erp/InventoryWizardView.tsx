import { ArrowRight, CheckCircle2, ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  CardButton,
  FORM_FIELD_DENSITY,
  FormActions,
  FormError,
  FormField,
  FormSection,
  Input,
  PrimaryButton,
  SecondaryButton,
  Stepper,
  formStackClass,
  secondaryButtonClassName,
} from "@/design-system";

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
  summaryPanel?: React.ReactNode;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  FULL: ClipboardList,
  PARTIAL: ShieldCheck,
  CYCLE: RefreshCw,
  CONTROL: CheckCircle2,
};

function TypeOption({
  selected,
  title,
  hint,
  icon: Icon,
  onSelect,
}: {
  selected: boolean;
  title: string;
  hint: string;
  icon: LucideIcon;
  onSelect: () => void;
}) {
  return (
    <CardButton
      type="button"
      active={selected}
      fullWidth
      density="comfortable"
      onClick={onSelect}
      className="!h-auto !flex-col !items-stretch !justify-start !gap-0 !px-4 !py-4 text-left"
    >
      <div
        className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${
          selected ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
      </div>
      <h4 className="mb-1 text-sm font-semibold text-slate-900">{title}</h4>
      <p className={`text-xs leading-relaxed ${selected ? "text-slate-600" : "text-slate-500"}`}>{hint}</p>
    </CardButton>
  );
}

/** Wizard — pełnoekranowy kreator krokowy z panelem podsumowania. */
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
  summaryPanel,
}: Props) {
  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Nowa inwentaryzacja</h2>
        <p className="mt-1 text-sm text-slate-500">
          Krok {step + 1} z {stepLabels.length}: {stepLabels[step]}
        </p>
      </div>

      <Stepper
        steps={stepLabels.map((label) => ({ label }))}
        activeIndex={step}
        aria-label="Kroki kreatora"
      />

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <FormSection density="comfortable" className="min-w-0">
          {error ? <FormError className="!mt-0 mb-4">{error}</FormError> : null}

          {step === 0 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {typeOptions.map((t) => (
                  <TypeOption
                    key={t.id}
                    selected={inventoryType === t.id}
                    title={t.label}
                    hint={t.hint}
                    icon={TYPE_ICONS[t.id] ?? ClipboardList}
                    onSelect={() => onTypeChange(t.id)}
                  />
                ))}
              </div>
              <div className={`border-t border-slate-100 pt-6 ${formStackClass}`}>
                <FormField label="Tytuł inwentaryzacji" htmlFor="inv-wizard-title">
                  <Input
                    id="inv-wizard-title"
                    type="text"
                    placeholder="np. Roczna inwentaryzacja 2026"
                    density={FORM_FIELD_DENSITY}
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                  />
                </FormField>
                <FormField label="Opis / notatka" htmlFor="inv-wizard-notes">
                  <Input
                    id="inv-wizard-notes"
                    type="text"
                    placeholder="Opcjonalny opis dla zespołu magazynowego"
                    density={FORM_FIELD_DENSITY}
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          ) : (
            <div className="min-h-[280px]">{stepContent}</div>
          )}
        </FormSection>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card variant="section" density="comfortable">
            <h3 className="text-sm font-semibold text-slate-900">Podsumowanie</h3>
            <p className="mt-1 text-xs text-slate-500">Bieżące ustawienia kreatora</p>
            <div className="mt-4">{summaryPanel ?? <p className="text-sm text-slate-500">Wybierz typ inwentaryzacji.</p>}</div>
          </Card>
        </aside>
      </div>

      <FormActions
        start={
          <SecondaryButton type="button" disabled={step === 0 || busy} onClick={onBack}>
            Wstecz
          </SecondaryButton>
        }
        end={
          <>
            <Link to={cancelPath} className={secondaryButtonClassName()}>
              Anuluj
            </Link>
            <PrimaryButton type="button" disabled={busy} onClick={onNext}>
              {isLastStep ? "Uruchom inwentaryzację" : "Dalej"}
              {!isLastStep ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
            </PrimaryButton>
          </>
        }
      />
    </div>
  );
}
