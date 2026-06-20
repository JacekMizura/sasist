import { ArrowRight, CheckCircle2, ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { filterToolbarBtnApply, filterToolbarBtnSecondary } from "@/components/filters/filterUiTokens";
import { tabsNavItemClassName } from "@/components/layout/TabsNav";
import { erpFieldInput, erpFieldLabel } from "./theme";

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
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer flex-col rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-amber-500 bg-amber-50/60 ring-1 ring-amber-500/30"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
      }`}
    >
      <div
        className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${
          selected ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
      </div>
      <h4 className={`mb-1 text-sm font-semibold ${selected ? "text-amber-950" : "text-slate-900"}`}>{title}</h4>
      <p className={`text-xs leading-relaxed ${selected ? "text-amber-900/80" : "text-slate-500"}`}>{hint}</p>
    </button>
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
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-7xl flex-col gap-6 px-4 pb-10 lg:px-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Nowa inwentaryzacja</h2>
        <p className="mt-1 text-sm text-slate-500">
          Krok {step + 1} z {stepLabels.length}: {stepLabels[step]}
        </p>
      </div>

      <nav className="flex gap-8 border-b border-slate-200" aria-label="Kroki kreatora">
        {stepLabels.map((label, idx) => (
          <span
            key={label}
            className={tabsNavItemClassName(idx === step, "default")}
            aria-current={idx === step ? "step" : undefined}
          >
            {label}
          </span>
        ))}
      </nav>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

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
              <div className="space-y-4 border-t border-slate-100 pt-6">
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
                  <span className={erpFieldLabel}>Opis / notatka</span>
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
          ) : (
            <div className="min-h-[280px]">{stepContent}</div>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Podsumowanie</h3>
            <p className="mt-1 text-xs text-slate-500">Bieżące ustawienia kreatora</p>
            <div className="mt-4">{summaryPanel ?? <p className="text-sm text-slate-500">Wybierz typ inwentaryzacji.</p>}</div>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button type="button" disabled={step === 0 || busy} onClick={onBack} className={filterToolbarBtnSecondary}>
          Wstecz
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={cancelPath} className={filterToolbarBtnSecondary}>
            Anuluj
          </Link>
          <button type="button" disabled={busy} onClick={onNext} className={filterToolbarBtnApply}>
            {isLastStep ? "Uruchom inwentaryzację" : "Dalej"}
            {!isLastStep ? <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
