import type { ManualActivatorType, ManualConditionFilterMode } from "../../../types/orderAutomation";

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
  activatorType: ManualActivatorType;
  conditionFilterMode: ManualConditionFilterMode;
  onChangeActivatorType: (v: ManualActivatorType) => void;
  onChangeConditionFilterMode: (v: ManualConditionFilterMode) => void;
};

export function AutomationModuleActivatorSettingsForm({
  activatorType,
  conditionFilterMode,
  onChangeActivatorType,
  onChangeConditionFilterMode,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Typ aktywatorów</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Globalny sposób prezentacji ręcznych aktywatorów we wszystkich regułach modułu.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <RadioOption<ManualActivatorType>
            name="globalActivatorType"
            value="default"
            current={activatorType}
            label="Domyślny"
            description="Przycisk w miejscu docelowym — na liście, karcie, w multiakcjach lub w pakowaniu WMS."
            onSelect={onChangeActivatorType}
          />
          <RadioOption<ManualActivatorType>
            name="globalActivatorType"
            value="side_panel"
            current={activatorType}
            label="Panel wysuwany z boku"
            description="Akcje dostępne z bocznego panelu kontekstowego zamówienia (jak w Sellasist)."
            onSelect={onChangeActivatorType}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sposób filtrowania aktywatorów</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Gdy reguła ma włączone sprawdzanie warunków przy ręcznym uruchamianiu i warunki nie są spełnione.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <RadioOption<ManualConditionFilterMode>
            name="globalConditionFilterMode"
            value="hide"
            current={conditionFilterMode}
            label="Całkowicie ukryj"
            description="Przycisk nie jest widoczny, dopóki warunki reguły nie są spełnione."
            onSelect={onChangeConditionFilterMode}
          />
          <RadioOption<ManualConditionFilterMode>
            name="globalConditionFilterMode"
            value="disabled"
            current={conditionFilterMode}
            label="Tylko wyszarz"
            description="Przycisk jest widoczny, ale nieaktywny — operator nie może go kliknąć."
            onSelect={onChangeConditionFilterMode}
          />
        </div>
      </div>
    </div>
  );
}
