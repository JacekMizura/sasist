import type { ManualExecutionMode, OrderAutomationModuleSettings } from "../../../types/orderAutomation";
import { DEFAULT_MANUAL_CONFIRM_MESSAGE } from "../../../utils/orderAutomationModuleSettings";
import { oaBtn, oaBtnPri, oaInp, oaLbl } from "./orderAutomationUiTokens";

function RadioOption<T extends string>({
  name,
  value,
  current,
  label,
  description,
  onSelect,
}: {
  name: string;
  value: T;
  current: T;
  label: string;
  description?: string;
  onSelect: (v: T) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-2 text-sm text-slate-800">
      <input
        type="radio"
        name={name}
        className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-slate-900"
        checked={current === value}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-slate-600">{description}</span> : null}
      </span>
    </label>
  );
}

type Props = {
  settings: OrderAutomationModuleSettings;
  onChange: (patch: Partial<OrderAutomationModuleSettings>) => void;
  /** Wywoływane po wyborze opcji radio — np. z toastem w rodzicu. */
  onChangeNotified?: (patch: Partial<OrderAutomationModuleSettings>) => void;
};

export function AutomationModuleActivatorSettingsForm({ settings, onChange, onChangeNotified }: Props) {
  const notify = onChangeNotified ?? onChange;
  const confirmText = settings.confirmMessage.trim() || DEFAULT_MANUAL_CONFIRM_MESSAGE;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Aktywatory ręczne</h3>
        <p className="mt-1 text-sm text-slate-600">
          Zachowanie wszystkich ręcznych aktywatorów w module — niezależnie od pojedynczej reguły.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">Typ aktywatorów</p>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <RadioOption
            name="globalActivatorType"
            value="default"
            current={settings.activatorType}
            label="Domyślny"
            description="Przycisk w miejscu docelowym — na liście, karcie, w multiakcjach lub w pakowaniu WMS."
            onSelect={(v) => notify({ activatorType: v })}
          />
          <RadioOption
            name="globalActivatorType"
            value="side_panel"
            current={settings.activatorType}
            label="Panel wysuwany z boku"
            description="Akcje dostępne z bocznego panelu kontekstowego zamówienia (jak w Sellasist)."
            onSelect={(v) => notify({ activatorType: v })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">Filtrowanie aktywatorów</p>
        <p className="text-xs text-slate-500">
          Gdy reguła ma włączone sprawdzanie warunków przy ręcznym uruchamianiu i warunki nie są spełnione.
        </p>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <RadioOption
            name="globalConditionFilterMode"
            value="hide"
            current={settings.conditionFilterMode}
            label="Całkowicie ukryj"
            description="Przycisk nie jest widoczny, dopóki warunki reguły nie są spełnione."
            onSelect={(v) => notify({ conditionFilterMode: v })}
          />
          <RadioOption
            name="globalConditionFilterMode"
            value="disabled"
            current={settings.conditionFilterMode}
            label="Tylko wyszarz"
            description="Przycisk jest widoczny, ale nieaktywny — operator nie może go kliknąć."
            onSelect={(v) => notify({ conditionFilterMode: v })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">Sposób wykonania aktywatorów</p>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <RadioOption<ManualExecutionMode>
            name="globalExecutionMode"
            value="immediate"
            current={settings.executionMode}
            label="Wykonaj od razu"
            description="Po kliknięciu akcja wykonuje się natychmiast (po ewentualnej weryfikacji warunków reguły)."
            onSelect={(v) => notify({ executionMode: v })}
          />
          <RadioOption<ManualExecutionMode>
            name="globalExecutionMode"
            value="confirm"
            current={settings.executionMode}
            label="Wymagaj potwierdzenia"
            description="Po kliknięciu akcja nie wykonuje się od razu — operator musi potwierdzić w kolejnym kroku."
            onSelect={(v) => notify({ executionMode: v })}
          />
        </div>
      </div>

      {settings.executionMode === "confirm" ? (
        <label className={oaLbl}>
          Treść okna potwierdzenia
          <textarea
            className={`${oaInp} mt-1 min-h-[4.5rem] resize-y py-2`}
            rows={3}
            value={settings.confirmMessage}
            placeholder={DEFAULT_MANUAL_CONFIRM_MESSAGE}
            onChange={(e) => onChange({ confirmMessage: e.target.value })}
            onBlur={(e) =>
              onChange({ confirmMessage: e.target.value.trim() || DEFAULT_MANUAL_CONFIRM_MESSAGE })
            }
          />
        </label>
      ) : null}

      {settings.executionMode === "confirm" ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Podgląd okna potwierdzenia</p>
          <p className="mt-3 text-sm text-slate-700">{confirmText}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={oaBtn} disabled>
              Anuluj
            </button>
            <button type="button" className={oaBtnPri} disabled>
              Potwierdź
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
